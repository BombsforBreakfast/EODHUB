/**
 * Rabbithole is available to every logged-in, verified EOD Hub member.
 * Page entry is gated by useRequireFullAccess (login + onboarding + verified),
 * the same as Jobs / Events / Sidebars — not by subscription or a separate flag.
 */

export function isVerifiedRabbitholeViewer(
  verificationStatus: string | null | undefined
): boolean {
  return verificationStatus === "verified";
}
