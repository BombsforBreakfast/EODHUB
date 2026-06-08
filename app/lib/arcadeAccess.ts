/** Client-safe helpers for arcade preview visibility (nav only). */

/** Only the founder account (FOUNDER_USER_ID) sees an enabled arcade nav link. */
export function canClickArcadeNav(isFounder: boolean): boolean {
  return isFounder;
}
