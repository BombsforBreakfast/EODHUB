const founderUserId =
  process.env.NEXT_PUBLIC_FOUNDER_USER_ID ||
  process.env.NEXT_PUBLIC_FOUNDER_ID ||
  process.env.NEXT_PUBLIC_FOUNDER_UID ||
  "";

export function isFounderUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (!founderUserId) return false;
  return userId === founderUserId;
}

export function hasRabbitholeFounderConfig(): boolean {
  return founderUserId.length > 0;
}

/**
 * Rabbithole is now open to every verified EOD HUB member (not just the
 * founder). The founder gate is still kept around — `isFounderUser` /
 * `hasRabbitholeFounderConfig` are used for founder-only operator toggles
 * (e.g. notification-flag localStorage overrides) that are unrelated to
 * read access.
 */
export function isVerifiedRabbitholeViewer(
  verificationStatus: string | null | undefined
): boolean {
  return verificationStatus === "verified";
}
