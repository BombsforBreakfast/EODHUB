import { randomBytes } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import {
  classifyFailedLoginAttempt,
  type FailedLoginClassification,
  type FailedLoginWaitlistStatus,
} from "@/app/lib/auth/failedAuthReasons";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  buildLoginUrl,
  buildTemporaryPasswordEmailHtml,
  TEMP_PASSWORD_EMAIL_SUBJECT,
} from "@/app/lib/email/temporaryPasswordEmail";
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

type FailedAuthReportForProvision = {
  id: string;
  failure_reason: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  attempt_count: number | null;
  user_exists_in_auth: boolean | null;
  user_exists_in_profiles: boolean | null;
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

function isDuplicateAuthUserError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("user already")
  );
}

async function getWaitlistStatus(
  adminClient: SupabaseClient,
  normalizedEmail: string,
): Promise<FailedLoginWaitlistStatus> {
  const { data, error } = await adminClient
    .from("waitlist_signups")
    .select("id")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) return "unknown";
  return data ? "in_waitlist" : "not_in_waitlist";
}

async function loadUnresolvedReportsForProvision(
  adminClient: SupabaseClient,
  args: { reportId?: string; normalizedEmail?: string },
): Promise<FailedAuthReportForProvision[]> {
  let query = adminClient
    .from("failed_auth_reports")
    .select(
      "id, failure_reason, risk_level, attempt_count, user_exists_in_auth, user_exists_in_profiles",
    )
    .is("admin_decision", null);

  if (args.reportId) {
    query = query.eq("id", args.reportId);
  } else if (args.normalizedEmail) {
    query = query.eq("normalized_email", args.normalizedEmail);
  } else {
    throw new Error("reportId or normalizedEmail required");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Could not load failed-login reports for review.");
  }

  return (data ?? []) as FailedAuthReportForProvision[];
}

function classifyReportsForProvision(
  reports: FailedAuthReportForProvision[],
  waitlistStatus: FailedLoginWaitlistStatus,
): FailedLoginClassification[] {
  return reports.map((report) =>
    classifyFailedLoginAttempt({
      reason: report.failure_reason,
      waitlistStatus,
      authExists: report.user_exists_in_auth,
      profileExists: report.user_exists_in_profiles,
      attemptCount: report.attempt_count,
      riskLevel: report.risk_level,
    }),
  );
}

async function findAuthUserFromProfile(
  adminClient: SupabaseClient,
  normalizedEmail: string,
): Promise<User | null> {
  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("user_id")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error || !profile?.user_id) return null;

  const { data, error: authError } = await adminClient.auth.admin.getUserById(
    profile.user_id as string,
  );
  if (authError || !data.user) return null;
  return data.user;
}

async function findExistingAuthUser(
  adminClient: SupabaseClient,
  normalizedEmail: string,
): Promise<{ user: User | null; lookupError: string | null }> {
  const profileUser = await findAuthUserFromProfile(adminClient, normalizedEmail);
  if (profileUser) {
    return { user: profileUser, lookupError: null };
  }

  const { users, listError } = await findAuthUsersByEmail(adminClient, normalizedEmail);
  if (listError) {
    return { user: null, lookupError: listError };
  }
  if (users.length > 1) {
    throw new Error(
      "Auth update failed: multiple auth accounts share this email. Resolve duplicate accounts before approving.",
    );
  }

  return { user: users[0] ?? null, lookupError: null };
}

async function updateTemporaryPassword(
  adminClient: SupabaseClient,
  userId: string,
  tempPassword: string,
): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: tempPassword,
    email_confirm: true,
  });

  if (error) {
    throw new Error("Auth update failed: " + error.message);
  }
}

async function createOrRecoverAuthUser(
  adminClient: SupabaseClient,
  normalizedEmail: string,
  tempPassword: string,
): Promise<{ userId: string; createdAuthUser: boolean; lookupError: string | null }> {
  const existing = await findExistingAuthUser(adminClient, normalizedEmail);
  if (existing.lookupError) {
    devAuthLog("failed-auth-resolve", {
      step: "auth_lookup_failed_continuing_to_create",
      email: normalizedEmail,
      error: existing.lookupError,
    });
  }

  if (existing.user) {
    await updateTemporaryPassword(adminClient, existing.user.id, tempPassword);
    return { userId: existing.user.id, createdAuthUser: false, lookupError: existing.lookupError };
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { created_by_admin_override: true },
  });

  if (!createError && created.user) {
    return { userId: created.user.id, createdAuthUser: true, lookupError: existing.lookupError };
  }

  if (isDuplicateAuthUserError(createError?.message)) {
    const recovered = await findExistingAuthUser(adminClient, normalizedEmail);
    if (recovered.user) {
      await updateTemporaryPassword(adminClient, recovered.user.id, tempPassword);
      return {
        userId: recovered.user.id,
        createdAuthUser: false,
        lookupError: recovered.lookupError ?? existing.lookupError,
      };
    }
    throw new Error("Auth update failed: user already exists but could not be located for update.");
  }

  throw new Error("Auth create failed: " + (createError?.message ?? "Failed to create auth user"));
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
    reportIds?: string[];
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

  if (args.reportIds && args.reportIds.length > 0) {
    query = query.in("id", args.reportIds);
  } else if (args.reportId) {
    query = query.eq("id", args.reportId);
  } else if (args.normalizedEmail) {
    query = query.eq("normalized_email", args.normalizedEmail);
  } else {
    throw new Error("claimReports requires reportIds, reportId, or normalizedEmail");
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

  const target = {
    reportId: "reportId" in args ? args.reportId : undefined,
    normalizedEmail: "reportId" in args ? undefined : normalizedEmail,
  };
  const reports = await loadUnresolvedReportsForProvision(adminClient, target);
  const unresolvedReportIds = reports.map((report) => report.id);

  if (unresolvedReportIds.length === 0) {
    throw new Error(
      "No unresolved failed-login reports found for this email. Another admin may have already acted.",
    );
  }

  const linkedReportId = unresolvedReportIds[0]!;
  const waitlistStatus = await getWaitlistStatus(adminClient, normalizedEmail);
  const classifications = classifyReportsForProvision(reports, waitlistStatus);
  const blockedClassification = classifications.find((classification) => !classification.adminCanOverride);

  devAuthLog("failed-auth-resolve", {
    step: "classification",
    email: normalizedEmail,
    waitlistStatus,
    classifications,
    reportIds: unresolvedReportIds,
  });

  if (blockedClassification) {
    throw new Error("Approval blocked: " + blockedClassification.displayReason);
  }

  try {
    const tempPassword = generateTemporaryPassword();
    const now = new Date().toISOString();

    devAuthLog("failed-auth-resolve", {
      step: "auth_lookup",
      email: normalizedEmail,
      reportIds: unresolvedReportIds,
    });

    const authResult = await createOrRecoverAuthUser(
      adminClient,
      normalizedEmail,
      tempPassword,
    );

    devAuthLog("failed-auth-resolve", {
      step: authResult.createdAuthUser ? "auth_created" : "auth_updated",
      email: normalizedEmail,
      userId: authResult.userId,
      lookupError: authResult.lookupError,
    });

    const { data: existingProfile, error: profileReadError } = await adminClient
      .from("profiles")
      .select("service, company_name")
      .eq("user_id", authResult.userId)
      .maybeSingle();

    if (profileReadError) {
      throw new Error("Profile upsert failed: " + profileReadError.message);
    }

    const forceOnboarding =
      !existingProfile || (!existingProfile.service && !existingProfile.company_name);

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert(
        {
          user_id: authResult.userId,
          email: normalizedEmail,
          verification_status: VERIFICATION.VERIFIED,
          email_verified: true,
          email_verified_at: now,
          admin_verified: true,
          is_approved: true,
          admin_approved_at: now,
          must_change_password: true,
          must_complete_onboarding: forceOnboarding,
          admin_provisioned_at: now,
        },
        { onConflict: "user_id" },
      );

    if (profileUpsertError) {
      throw new Error("Profile upsert failed: " + profileUpsertError.message);
    }

    devAuthLog("failed-auth-resolve", {
      step: "profile_upserted",
      userId: authResult.userId,
      email: normalizedEmail,
      forceOnboarding,
    });

    await createAuthAccessOverride(adminClient, {
      normalizedEmail,
      ipAddress: args.ipAddress,
      scope: "full",
      adminUserId: args.adminUserId,
      failedAuthReportId: linkedReportId,
      reason: "Admin provisioned temp password from Failed Auth report",
    });
    devAuthLog("failed-auth-resolve", {
      step: "access_override_created",
      email: normalizedEmail,
      reportId: linkedReportId,
    });

    if (!process.env.RESEND_API_KEY) {
      throw new Error("Resend email failed: RESEND_API_KEY is not configured.");
    }

    const loginUrl = buildLoginUrl(args.origin);
    const html = buildTemporaryPasswordEmailHtml({
      loginUrl,
      email: normalizedEmail,
      temporaryPassword: tempPassword,
    });

    devAuthLog("failed-auth-resolve", {
      step: "resend_send",
      email: normalizedEmail,
      userId: authResult.userId,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
      to: normalizedEmail,
      subject: TEMP_PASSWORD_EMAIL_SUBJECT,
      html,
    });

    if (emailError) {
      throw new Error("Resend email failed: " + emailError.message);
    }

    const { error: sentAtError } = await adminClient
      .from("profiles")
      .update({ temp_password_email_sent_at: now })
      .eq("user_id", authResult.userId);
    if (sentAtError) {
      devAuthLog("failed-auth-resolve", {
        step: "temp_password_sent_at_update_failed",
        userId: authResult.userId,
        error: sentAtError.message,
      });
    }

    devAuthLog("failed-auth-resolve", {
      step: "resend_sent",
      email: normalizedEmail,
      userId: authResult.userId,
    });

    const resolvedReportIds = await claimReports(adminClient, {
      adminUserId: args.adminUserId,
      decision: "provisioned",
      notes,
      reportId: "reportId" in args ? args.reportId : undefined,
      normalizedEmail: "reportId" in args ? undefined : normalizedEmail,
    });

    devAuthLog("failed-auth-resolve", {
      step: "reports_resolved",
      reportIds: resolvedReportIds,
      originallyUnresolvedReportIds: unresolvedReportIds,
      userId: authResult.userId,
    });

    return {
      userId: authResult.userId,
      email: normalizedEmail,
      emailSent: true,
      createdAuthUser: authResult.createdAuthUser,
      forceOnboarding,
      resolvedReportIds: resolvedReportIds.length > 0 ? resolvedReportIds : unresolvedReportIds,
    };
  } catch (err) {
    devAuthLog("failed-auth-resolve", {
      step: "provision_failed",
      email: normalizedEmail,
      reportIds: unresolvedReportIds,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function dismissFailedAuthReports(
  adminClient: SupabaseClient,
  args: {
    adminUserId: string;
    notes?: string | null;
    reportId?: string;
    reportIds?: string[];
    normalizedEmail?: string;
  },
): Promise<DismissResult> {
  const notes = clampNotes(args.notes);
  const resolvedReportIds = await claimReports(adminClient, {
    adminUserId: args.adminUserId,
    decision: "dismissed",
    notes,
    reportId: args.reportId,
    reportIds: args.reportIds,
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
