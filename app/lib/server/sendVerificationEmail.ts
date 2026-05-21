import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  buildVerificationEmailHtml,
  buildVerifyEmailUrl,
  getAppOrigin,
  VERIFY_EMAIL_SUBJECT,
} from "@/app/lib/email/verificationEmail";
import { createVerificationToken } from "@/app/lib/server/emailVerificationTokens";
import { isAwaitingEmailStatus, VERIFICATION } from "@/app/lib/verificationStatus";

export type SendVerificationEmailResult =
  | { sent: true }
  | { sent: false; reason: "no_user" | "already_verified" | "wrong_status" | "no_resend_key" | "resend_error" | "token_error" | "config" };

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Send branded verification email. Caller must ensure profile is in awaiting-email state.
 */
export async function sendVerificationEmailForUser(
  userId: string,
  origin: string,
): Promise<SendVerificationEmailResult> {
  const admin = getAdminClient();
  if (!admin) {
    devAuthLog("verify-email-send", { step: "missing_service_role", userId });
    return { sent: false, reason: "config" };
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) {
    devAuthLog("verify-email-send", { step: "no_user", userId });
    return { sent: false, reason: "no_user" };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email_verified, verification_status, first_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    devAuthLog("verify-email-send", { step: "no_profile", userId, error: profileError?.message });
    return { sent: false, reason: "wrong_status" };
  }

  if (profile.email_verified) {
    devAuthLog("verify-email-send", { step: "already_verified", userId });
    return { sent: false, reason: "already_verified" };
  }

  let status = profile.verification_status as string | null;
  if (!isAwaitingEmailStatus(status)) {
    const { error: repairError } = await admin
      .from("profiles")
      .update({
        verification_status: VERIFICATION.AWAITING_EMAIL,
        email_verified: false,
        admin_verified: false,
      })
      .eq("user_id", userId);

    if (repairError) {
      devAuthLog("verify-email-send", {
        step: "repair_status_failed",
        userId,
        status,
        error: repairError.message,
      });
      return { sent: false, reason: "wrong_status" };
    }
    status = VERIFICATION.AWAITING_EMAIL;
    devAuthLog("verify-email-send", { step: "repaired_status", userId, status });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("sendVerificationEmailForUser: RESEND_API_KEY not set");
    return { sent: false, reason: "no_resend_key" };
  }

  try {
    const rawToken = await createVerificationToken(userId);
    devAuthLog("verify-email-send", { step: "token_created", userId });

    const verifyUrl = buildVerifyEmailUrl(rawToken, getAppOrigin(origin));
    const firstName =
      (profile as { first_name: string | null }).first_name?.trim() || "EOD Member";

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
      to: email,
      subject: VERIFY_EMAIL_SUBJECT,
      html: buildVerificationEmailHtml({ firstName, verifyUrl }),
    });

    if (emailError) {
      console.error("sendVerificationEmailForUser: Resend error", emailError);
      devAuthLog("verify-email-send", { step: "resend_error", userId });
      return { sent: false, reason: "resend_error" };
    }

    devAuthLog("verify-email-send", { step: "sent", userId, domain: email.split("@")[1] });
    return { sent: true };
  } catch (err) {
    console.error("sendVerificationEmailForUser:", err);
    devAuthLog("verify-email-send", { step: "token_error", userId });
    return { sent: false, reason: "token_error" };
  }
}
