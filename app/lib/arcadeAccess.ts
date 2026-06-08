/** Client-safe helpers for arcade preview visibility (nav only). */

export function canClickArcadeNav(isAdmin: boolean, isFounder: boolean): boolean {
  return isAdmin || isFounder;
}
