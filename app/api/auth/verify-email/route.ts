import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consumeVerificationToken } from "@/app/lib/server/emailVerificationTokens";
import { getAppOrigin } from "@/app/lib/email/verificationEmail";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  hasRequiredSignupNames,
  isGrandfatheredSignupProfile,
} from "@/app/lib/profileCompleteness";
import { isAwaitingEmailStatus, VERIFICATION } from "@/app/lib/verificationStatus";
import { insertOnboardingEvent } from "@/app/lib/onboardingAnalyticsServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getAppOrigin(req.nextUrl.origin);
  const rawToken = req.nextUrl.searchParams.get("token")?.trim();

  if (!rawToken) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", origin));
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("verify-email: missing SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.redirect(new URL("/verify-email?error=invalid", origin));
  }

  const result = await consumeVerificationToken(rawToken);
  if (!result.ok) {
    devAuthLog("verify-email-click", { step: "token_invalid", reason: result.reason });
    return NextResponse.redirect(new URL("/verify-email?error=invalid", origin));
  }

  devAuthLog("verify-email-click", { step: "token_ok", userId: result.userId });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: existing } = await adminClient
    .from("profiles")
    .select(
      "email_verified, verification_status, first_name, last_name, name, display_name, created_at, is_pure_admin",
    )
    .eq("user_id", result.userId)
    .maybeSingle();

  if (existing?.email_verified) {
    devAuthLog("verify-email-click", { step: "already_verified", userId: result.userId });
    return NextResponse.redirect(new URL("/email-verified", origin));
  }

  if (
    existing &&
    !isGrandfatheredSignupProfile(existing) &&
    !hasRequiredSignupNames(existing)
  ) {
    devAuthLog("verify-email-click", { step: "incomplete_profile", userId: result.userId });
    return NextResponse.redirect(new URL("/onboarding?notice=required", origin));
  }

  if (!existing) {
    return NextResponse.redirect(new URL("/onboarding?notice=required", origin));
  }

  const now = new Date().toISOString();
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      email_verified: true,
      email_verified_at: now,
      verification_status: VERIFICATION.AWAITING_ADMIN,
    })
    .eq("user_id", result.userId);

  if (updateError) {
    console.error("verify-email: profile update failed", updateError);
    return NextResponse.redirect(new URL("/verify-email?error=invalid", origin));
  }

  void insertOnboardingEvent(adminClient, result.userId, "email_verified", "success");

  if (existing && isAwaitingEmailStatus(existing.verification_status)) {
    devAuthLog("verify-email-click", {
      step: "state_transition",
      userId: result.userId,
      from: existing.verification_status,
      to: VERIFICATION.AWAITING_ADMIN,
    });
  }

  return NextResponse.redirect(new URL("/email-verified", origin));
}
