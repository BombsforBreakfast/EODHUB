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
