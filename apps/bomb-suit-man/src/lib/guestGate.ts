/** Levels playable without an account (guest mode). */
export const GUEST_PLAYABLE_LEVEL_IDS = ["level-1", "level-2"] as const;

export function isGuestPlayableLevel(levelId: string): boolean {
  return (GUEST_PLAYABLE_LEVEL_IDS as readonly string[]).includes(levelId);
}

export function canPlayLevelAsGuest(levelId: string, isSignedIn: boolean): boolean {
  if (isSignedIn) return true;
  return isGuestPlayableLevel(levelId);
}

export function guestSignupWallMessage(levelId: string): string {
  if (isGuestPlayableLevel(levelId)) return "";
  return "Create a free account to unlock Level 3 and the rest of the campaign.";
}
