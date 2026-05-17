/**
 * Rabbithole is open to every verified EOD HUB member.
 * Founder-only operator checks use /api/me/is-founder (FOUNDER_USER_ID is server-only).
 */

export function isVerifiedRabbitholeViewer(
  verificationStatus: string | null | undefined
): boolean {
  return verificationStatus === "verified";
}
