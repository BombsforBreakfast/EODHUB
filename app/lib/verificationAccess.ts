import { isOAuthOnlyTrustedProvider } from "./auth/oauthProviders";
import {
  isAwaitingAdminStatus,
  isAwaitingEmailStatus,
  isLegacyPendingAdmin,
  VERIFICATION,
} from "./verificationStatus";

export type VerificationProfile = {
  account_type?: string | null;
  email_verified?: boolean | null;
  admin_verified?: boolean | null;
  verification_status?: string | null;
  is_pure_admin?: boolean | null;
};

export function hasFullPlatformAccess(p: VerificationProfile): boolean {
  // Pure admins always have full access — they never go through the user
  // verification queue and must not be bounced by the new gate.
  if (p.is_pure_admin) return true;
  // Business / Organization page auth accounts are provisioned only after a
  // verified owner account passes the server-side gates.
  if (p.account_type === "business_org") return true;
  return Boolean(
    p.email_verified &&
      p.admin_verified &&
      p.verification_status === VERIFICATION.VERIFIED,
  );
}

/** Email confirmed; waiting on admin or community approval. */
export function isInAdminReviewQueue(p: VerificationProfile): boolean {
  const status = p.verification_status;
  if (!p.email_verified) return false;
  if (isAwaitingAdminStatus(status)) return true;
  if (isLegacyPendingAdmin(status, !!p.email_verified)) return true;
  return false;
}

/** Must click Resend verification link before admin queue. */
export function needsEmailVerification(p: VerificationProfile): boolean {
  if (p.account_type === "business_org") return false;
  if (p.email_verified) return false;
  const status = p.verification_status;
  if (isAwaitingEmailStatus(status)) return true;
  // Incomplete onboarding / legacy: in admin-ish state but email not verified
  if (isAwaitingAdminStatus(status) && !p.email_verified) return true;
  if (status === VERIFICATION.LEGACY_PENDING && !p.email_verified) return true;
  return !p.email_verified && !!status && status !== VERIFICATION.VERIFIED && status !== VERIFICATION.DENIED;
}

/** @deprecated use isInAdminReviewQueue */
export function isPendingOrAdminReview(p: VerificationProfile): boolean {
  return isInAdminReviewQueue(p);
}

/** Google or Apple OAuth-only signups skip Resend (provider-trusted email). */
export { isOAuthOnlyTrustedProvider };

/** @deprecated use isOAuthOnlyTrustedProvider */
export const isOAuthOnlyGoogleUser = isOAuthOnlyTrustedProvider;

/** @deprecated use isOAuthOnlyTrustedProvider */
export const isOAuthGoogleUser = isOAuthOnlyTrustedProvider;
