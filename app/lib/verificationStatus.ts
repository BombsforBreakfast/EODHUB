/**
 * Canonical verification_status values for the email → admin approval pipeline.
 * Legacy pending_* values are still read for backward compatibility.
 */

export const VERIFICATION = {
  AWAITING_EMAIL: "awaiting_email_verification",
  AWAITING_ADMIN: "awaiting_admin_review",
  VERIFIED: "verified",
  DENIED: "denied",
  /** @deprecated use AWAITING_EMAIL */
  LEGACY_PENDING_EMAIL: "pending_email_verification",
  /** @deprecated use AWAITING_ADMIN */
  LEGACY_PENDING_ADMIN: "pending_admin_review",
  /** @deprecated grandfathered admin queue */
  LEGACY_PENDING: "pending",
} as const;

export type VerificationStatusValue =
  | typeof VERIFICATION.AWAITING_EMAIL
  | typeof VERIFICATION.AWAITING_ADMIN
  | typeof VERIFICATION.VERIFIED
  | typeof VERIFICATION.DENIED
  | typeof VERIFICATION.LEGACY_PENDING_EMAIL
  | typeof VERIFICATION.LEGACY_PENDING_ADMIN
  | typeof VERIFICATION.LEGACY_PENDING;

export function isAwaitingEmailStatus(status: string | null | undefined): boolean {
  return (
    status === VERIFICATION.AWAITING_EMAIL ||
    status === VERIFICATION.LEGACY_PENDING_EMAIL
  );
}

export function isAwaitingAdminStatus(status: string | null | undefined): boolean {
  return (
    status === VERIFICATION.AWAITING_ADMIN ||
    status === VERIFICATION.LEGACY_PENDING_ADMIN
  );
}

/** Legacy rows: `pending` with email already verified (migration backfill). */
export function isLegacyPendingAdmin(status: string | null | undefined, emailVerified: boolean): boolean {
  return status === VERIFICATION.LEGACY_PENDING && emailVerified;
}
