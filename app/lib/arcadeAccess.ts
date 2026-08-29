import { PRODUCT_FEATURE_FLAGS } from "./productFeatureFlags";

/** Client-safe helpers for arcade nav visibility. */

/**
 * Arcade Hub link. Parked via PRODUCT_FEATURE_FLAGS.arcadeEnabled.
 * Preview-password rollback is still server-side via ARCADE_PUBLIC=false.
 */
export function canClickArcadeNav(_isFounder?: boolean): boolean {
  return PRODUCT_FEATURE_FLAGS.arcadeEnabled;
}
