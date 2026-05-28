import {
  isGrandfatheredSignupProfile,
  isSignupProfileComplete,
  type SignupProfileFields,
} from "./profileCompleteness";
import {
  hasFullPlatformAccess,
  needsEmailVerification,
  type VerificationProfile,
} from "./verificationAccess";

export const ONBOARDING_REQUIRED_FIELDS_MESSAGE =
  "Required fields — please enter before continuing.";

/** Profile columns needed to decide whether to send someone back to onboarding. */
export const ONBOARDING_GATE_PROFILE_SELECT =
  "user_id, first_name, last_name, service, company_name, account_type, is_pure_admin, must_complete_onboarding, created_at";

export type OnboardingGateProfile = SignupProfileFields &
  VerificationProfile & {
    user_id: string;
    is_pure_admin?: boolean | null;
    must_complete_onboarding?: boolean | null;
    subscription_status?: string | null;
    is_admin?: boolean | null;
  };

export function shouldRedirectToOnboarding(
  profile: OnboardingGateProfile | null | undefined,
): boolean {
  if (!profile) return true;
  if (profile.is_pure_admin) return false;
  // Admin-approved users (verified + admin_verified + email_verified) keep
  // platform access even if their profile fields are sparse. Admin approval
  // is the ultimate trust signal and overrides the completeness check.
  if (hasFullPlatformAccess(profile)) return false;
  if (profile.must_complete_onboarding) return true;
  if (isSignupProfileComplete(profile)) return false;
  if (isGrandfatheredSignupProfile(profile)) return false;
  return true;
}

export function onboardingRedirectUrl(withNotice = false): string {
  return withNotice ? "/onboarding?notice=required" : "/onboarding";
}

/** After sign-in, pick the next route before full platform access. */
export function resolveLoginRedirectPath(profile: OnboardingGateProfile | null): string {
  if (!profile || shouldRedirectToOnboarding(profile)) {
    return onboardingRedirectUrl(false);
  }
  if (hasFullPlatformAccess(profile)) return "/";
  if (needsEmailVerification(profile)) return "/verify-email";
  return "/pending";
}

/** After onboarding is complete but access is not fully granted yet. */
export function resolvePreAccessRedirectPath(profile: OnboardingGateProfile): string {
  if (shouldRedirectToOnboarding(profile)) {
    return onboardingRedirectUrl(true);
  }
  if (hasFullPlatformAccess(profile)) return "/";
  if (needsEmailVerification(profile)) return "/verify-email";
  return "/pending";
}
