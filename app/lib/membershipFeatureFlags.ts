/**
 * Rollout flags for membership country + EOD cert onboarding.
 *
 * Interim (pre–web launch):
 * - Country collection off — keep profiles.country null for new signups.
 * - EOD cert onboarding UI native-only — web Safari/desktop unchanged until flag flips.
 *
 * Flip both to true (and set eodCertOnboardingNativeOnly false) for the all-surfaces deploy.
 */
export const MEMBERSHIP_FEATURE_FLAGS = {
  /** When false: hide country UI, do not require/persist country on onboarding. */
  countryCollectEnabled: false,
  /** When true: show EOD cert upload on onboarding only inside Capacitor. */
  eodCertOnboardingNativeOnly: true,
} as const;
