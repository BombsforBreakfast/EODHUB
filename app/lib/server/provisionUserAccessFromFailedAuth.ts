import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  buildLoginUrl,
  buildTemporaryPasswordEmailHtml,
  TEMP_PASSWORD_EMAIL_SUBJECT,
} from "@/app/lib/email/temporaryPasswordEmail";
import { hasFullPlatformAccess } from "@/app/lib/verificationAccess";
import { VERIFICATION } from "@/app/lib/verificationStatus";
import { createAuthAccessOverride } from "@/app/lib/server/authAccessOverrides";

const TEMP_PASSWORD_BYTES = 12;

export type FailedAuthAdminDecision = "block_overridden" | "provisioned" | "dismissed";

export type ProvisionUserAccessResult = {
  userId: string;
  email: string;
  emailSent: boolean;
  emailSkippedReason?: "no_resend_key" | "resend_error";
  createdAuthUser: boolean;
  forceOnboarding: boolean;
  resolvedReportIds: string[];
};

export type DismissResult = {
  resolvedReportIds: string[];
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function generateTemporaryPassword(): string {
  return randomBytes(TEMP_PASSWORD_BYTES).toString("base64url");
}

function clampNotes(notes: string | null | undefined): string | null {
  if (typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 1000);
}

/**
 * Atomically claim one or more unresolved reports. Returns the IDs of rows
 * actually marked. If no rows are claimed (because they were already
 * resolved by another admin in a race), the caller should abort without
 * doing any destructive work.
 */
async function claimReports(
  adminClient: SupabaseClient,
  args: {
    adminUserId: string;
    decision: FailedAuthAdminDecision;
    notes: string | null;
    reportId?: string;
    normalizedEmail?: string;
  },
): Promise<string[]> {
  let query = adminClient
    .from("failed_auth_reports")
    .update({
      admin_decision: args.decision,
      admin_decided_at: new Date().toISOString(),
      admin_decided_by: args.adminUserId,
      admin_notes: args.notes,
    })
    .is("admin_decision", null);

  if (args.reportId) {
    query = query.eq("id", args.reportId);
  } else if (args.normalizedEmail) {
    query = query.eq("normalized_email", args.normalizedEmail);
  } else {
    throw new Error("claimReports requires reportId or normalizedEmail");
  }

  const { data, error } = await query.select("id");

  if (error) {
    throw new Error("Failed to claim failed auth report(s): " + error.message);
  }

  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export type ProvisionTarget =
  | { reportId: string; ipAddress?: string | null; email: string }
  | { normalizedEmail: string; ipAddress?: string | null };

export async function provisionUserAccessFromFailedAuth(
  adminClient: SupabaseClient,
  args: ProvisionTarget & {
    adminUserId: string;
    notes?: string | null;
    origin: string;
  },
): Promise<ProvisionUserAccessResult> {
  const normalizedEmail =
    "normalizedEmail" in args
      ? normalizeEmail(args.normalizedEmail)
      : normalizeEmail(args.email);
  if (!normalizedEmail.includes("@")) {
    throw new Error("A valid email address is required to provision access.");
  }
  const notes = clampNotes(args.notes);

  // 1. Claim the report(s) atomically. Bail if nothing to claim (race
  //    condition: another admin already resolved them).
  const resolvedReportIds = await claimReports(adminClient, {
    adminUserId: args.adminUserId,
    decision: "provisioned",
    notes,
    reportId: "reportId" in args ? args.reportId : undefined,
    normalizedEmail: "reportId" in args ? undefined : normalizedEmail,
  });

  if (resolvedReportIds.length === 0) {
    throw new Error(
      "No unresolved failed-auth reports found for this email — another admin may have already acted.",
    );
  }

  // The first claimed report id is what we use to link the override row.
  const linkedReportId = resolvedReportIds[0]!;

  // Track work so we can roll back the claim on failure.
  let rollbackOnFailure = true;
  try {
    // 2. Create or update the auth user.
    const tempPassword = generateTemporaryPassword();
    const { users, listError } = await findAuthUsersByEmail(adminClient, normalizedEmail);
    if (listError) {
      throw new Error("Could not look up auth user: " + listError);
    }

    let userId: string;
    let createdAuthUser = false;

    if (users.length === 0) {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
      });
      if (createError || !created.user) {
        throw new Error(createError?.message ?? "Failed to create auth user");
      }
      userId = created.user.id;
      createdAuthUser = true;
    } else if (users.length > 1) {
      throw new Error(
        "Multiple auth accounts share this email. Resolve duplicate accounts before provisioning.",
      );
    } else {
      userId = users[0]!.id;
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });
      if (updateError) {
        throw new Error("Failed to set temporary password: " + updateError.message);
      }
    }

    // 3. Ensure profile stub exists and inspect existing state.
    const stub = await ensureProfileStubForUser(adminClient, userId, normalizedEmail);
    if (!stub.ok) {
      throw new Error(stub.error ?? "Failed to ensure profile");
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select(
        "verification_status, email_verified, admin_verified, service, company_name",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      throw new Error("Failed to load profile: " + profileError.message);
    }

    const forceOnboarding =
      !profile ||
      !hasFullPlatformAccess(profile) ||
      profile.verification_status === VERIFICATION.DENIED ||
      (!profile.service && !profile.company_name);

    const now = new Date().toISOString();
    const profileUpdate: Record<string, unknown> = {
      email: normalizedEmail,
      must_change_password: true,
      admin_provisioned_at: now,
    };

    if (forceOnboarding) {
      profileUpdate.must_complete_onboarding = true;
      profileUpdate.verification_status = VERIFICATION.AWAITING_EMAIL;
      profileUpdate.email_verified = false;
      profileUpdate.email_verified_at = null;
      profileUpdate.admin_verified = false;
      profileUpdate.is_approved = false;
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("user_id", userId);

    if (profileUpdateError) {
      throw new Error("Failed to update profile: " + profileUpdateError.message);
    }

    // 4. NOW that auth + profile are committed, create the override.
    //    This way, if any earlier step fails, we don't leak a 7-day full
    //    bypass for an email that wasn't actually provisioned.
    await createAuthAccessOverride(adminClient, {
      normalizedEmail,
      ipAddress: args.ipAddress,
      scope: "full",
      adminUserId: args.adminUserId,
      failedAuthReportId: linkedReportId,
      reason: "Admin provisioned temp password from Failed Auth report",
    });

    // 5. Send the email last so a Resend hiccup doesn't take down the rest.
    //    A failed email leaves the admin to communicate the password manually,
    //    but the user is still provisioned and the report is still resolved.
    let emailSent = false;
    let emailSkippedReason: ProvisionUserAccessResult["emailSkippedReason"];

    if (!process.env.RESEND_API_KEY) {
      emailSkippedReason = "no_resend_key";
    } else {
      const loginUrl = buildLoginUrl(args.origin);
      const html = buildTemporaryPasswordEmailHtml({
        loginUrl,
        email: normalizedEmail,
        temporaryPassword: tempPassword,
      });

      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
        to: normalizedEmail,
        subject: TEMP_PASSWORD_EMAIL_SUBJECT,
        html,
      });

      if (emailError) {
        emailSkippedReason = "resend_error";
        devAuthLog("failed-auth-resolve", {
          step: "temp_password_email_failed",
          reportId: linkedReportId,
          userId,
          error: emailError.message,
        });
      } else {
        emailSent = true;
        await adminClient
          .from("profiles")
          .update({ temp_password_email_sent_at: now })
          .eq("user_id", userId);
      }
    }

    // Past this point, do NOT roll back the claim — the side effects are done.
    rollbackOnFailure = false;

    devAuthLog("failed-auth-resolve", {
      step: "provisioned",
      reportIds: resolvedReportIds,
      userId,
      emailSent,
      forceOnboarding,
      createdAuthUser,
    });

    return {
      userId,
      email: normalizedEmail,
      emailSent,
      emailSkippedReason,
      createdAuthUser,
      forceOnboarding,
      resolvedReportIds,
    };
  } catch (err) {
    if (rollbackOnFailure && resolvedReportIds.length > 0) {
      // Best-effort rollback so the admin can retry without "already resolved".
      await adminClient
        .from("failed_auth_reports")
        .update({
          admin_decision: null,
          admin_decided_at: null,
          admin_decided_by: null,
          admin_notes: null,
        })
        .in("id", resolvedReportIds);
      devAuthLog("failed-auth-resolve", {
        step: "provision_rolled_back",
        reportIds: resolvedReportIds,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

export async function dismissFailedAuthReports(
  adminClient: SupabaseClient,
  args: {
    adminUserId: string;
    notes?: string | null;
    reportId?: string;
    normalizedEmail?: string;
  },
): Promise<DismissResult> {
  const notes = clampNotes(args.notes);
  const resolvedReportIds = await claimReports(adminClient, {
    adminUserId: args.adminUserId,
    decision: "dismissed",
    notes,
    reportId: args.reportId,
    normalizedEmail: args.normalizedEmail,
  });

  if (resolvedReportIds.length === 0) {
    throw new Error(
      "No unresolved failed-auth reports found — another admin may have already acted.",
    );
  }

  devAuthLog("failed-auth-resolve", {
    step: "dismissed",
    reportIds: resolvedReportIds,
  });

  return { resolvedReportIds };
}
