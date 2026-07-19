/** Client-safe helpers for arcade nav visibility. */

/**
 * Arcade is live on web and native (App Store 1.1+).
 * Kill-switch is server-side via ARCADE_PUBLIC=false.
 */
export function canClickArcadeNav(_isFounder?: boolean): boolean {
  return true;
}
