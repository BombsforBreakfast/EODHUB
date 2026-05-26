import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  APPROVAL_EMAIL_SUBJECT,
  buildApprovalEmailHtml,
  buildLoginUrl,
} from "@/app/lib/email/approvalEmail";
import { VERIFICATION } from "@/app/lib/verificationStatus";
import { ensureWelcomeSidebarMessage } from "@/app/lib/server/ensureWelcomeSidebarMessage";

export type ApproveUserSource = "admin" | "vouch";

export type ApproveUserAccountResult = {
  success: true;
  wasAlreadyApproved: boolean;
  emailSent: boolean;
  emailSkippedReason?:
    | "already_sent"
    | "no_resend_key"
    | "no_email"
    | "resend_error"
    | "config";
};

function isFullyApproved(profile: {
  admin_verified?: boolean | null;
  verification_status?: string | null;
}): boolean {
  return (
    profile.admin_verified === true &&
    profile.verification_status === VERIFICATION.VERIFIED
  );
}

/**
 * Grant full platform access and send branded approval email (idempotent).
 */
export async function approveUserAccount(
  adminClient: SupabaseClient,
  userId: string,
  origin: string,
  source: ApproveUserSource,
): Promise<ApproveUserAccountResult> {
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select(
      "first_name, referral_code, email_verified, admin_verified, verification_status, approval_email_sent_at, admin_approved_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    devAuthLog("approve-user", { step: "no_profile", userId, source, error: profileError?.message });
    throw new Error(profileError?.message ?? "Profile not found");
  }

  const wasAlreadyApproved = isFullyApproved(profile);
  const now = new Date().toISOString();

  devAuthLog("approve-user", {
    step: "transition_start",
    userId,
    source,
    wasAlreadyApproved,
    fromStatus: profile.verification_status,
    approvalEmailSentAt: profile.approval_email_sent_at ?? null,
  });

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      verification_status: VERIFICATION.VERIFIED,
      is_approved: true,
      email_verified: true,
      admin_verified: true,
      admin_approved_at: profile.admin_approved_at ?? now,
    })
    .eq("user_id", userId);

  if (updateError) {
    devAuthLog("approve-user", { step: "db_update_failed", userId, source, error: updateError.message });
    throw new Error("DB update failed: " + updateError.message);
  }

  devAuthLog("approve-user", {
    step: "state_transition",
    userId,
    source,
    toStatus: VERIFICATION.VERIFIED,
    adminApprovedAt: profile.admin_approved_at ?? now,
  });

  void ensureWelcomeSidebarMessage(adminClient, userId).catch((err) => {
    console.error("approveUserAccount: welcome sidebar ensure failed", err);
  });

  // Look up the user's auth email once. We use it for both waitlist cleanup
  // (below) and, if applicable, the approval email further down.
  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? null;

  // Now that the user has full platform access, remove any matching
  // pre-signup waitlist entry so they don't show up in the admin waitlist
  // tab. Idempotent — a no-op if they were never on the waitlist or were
  // already cleaned up by a prior approval call. Failures are logged but
  // do not block approval.
  if (email) {
    // Waitlist inserts go through validateEmailForRegistration which trims
    // and lowercases, so an exact match on the lowercased auth email is
    // safe and avoids ILIKE wildcard pitfalls (e.g. `_` / `%` in the local
    // part of an email matching unrelated rows).
    const normalizedEmail = email.trim().toLowerCase();
    const { error: waitlistDeleteError } = await adminClient
      .from("waitlist_signups")
      .delete()
      .eq("email", normalizedEmail);
    if (waitlistDeleteError) {
      devAuthLog("approve-user", {
        step: "waitlist_cleanup_failed",
        userId,
        source,
        error: waitlistDeleteError.message,
      });
    } else {
      devAuthLog("approve-user", {
        step: "waitlist_cleanup",
        userId,
        source,
      });
    }
  }

  if (profile.approval_email_sent_at) {
    devAuthLog("approve-user", { step: "email_skipped", userId, source, reason: "already_sent" });
    return {
      success: true,
      wasAlreadyApproved,
      emailSent: false,
      emailSkippedReason: "already_sent",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("approveUserAccount: RESEND_API_KEY not set");
    devAuthLog("approve-user", { step: "email_skipped", userId, source, reason: "no_resend_key" });
    return {
      success: true,
      wasAlreadyApproved,
      emailSent: false,
      emailSkippedReason: "no_resend_key",
    };
  }

  if (userError || !email) {
    devAuthLog("approve-user", { step: "email_skipped", userId, source, reason: "no_email" });
    return {
      success: true,
      wasAlreadyApproved,
      emailSent: false,
      emailSkippedReason: "no_email",
    };
  }

  const firstName = profile.first_name?.trim() || "EOD Member";
  const loginUrl = buildLoginUrl(origin);
  const html = buildApprovalEmailHtml({
    firstName,
    loginUrl,
    referralCode: profile.referral_code,
    approvedViaVouch: source === "vouch",
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: email,
    subject: APPROVAL_EMAIL_SUBJECT,
    html,
  });

  if (emailError) {
    console.error("approveUserAccount: Resend error", emailError);
    devAuthLog("approve-user", {
      step: "resend_error",
      userId,
      source,
      domain: email.split("@")[1],
    });
    return {
      success: true,
      wasAlreadyApproved,
      emailSent: false,
      emailSkippedReason: "resend_error",
    };
  }

  const sentAt = new Date().toISOString();
  await adminClient
    .from("profiles")
    .update({ approval_email_sent_at: sentAt })
    .eq("user_id", userId);

  devAuthLog("approve-user", {
    step: "email_sent",
    userId,
    source,
    domain: email.split("@")[1],
    sentAt,
  });

  return {
    success: true,
    wasAlreadyApproved,
    emailSent: true,
  };
}
