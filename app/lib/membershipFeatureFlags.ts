/**
 * Rollout flags for membership country + EOD cert onboarding.
 *
 * Production interim (pre–web launch):
 * - Country collection off — keep profiles.country null for new signups.
 * - EOD cert onboarding UI native-only — web Safari/desktop unchanged until flag flips.
 *
 * Local development enables both so onboarding runthroughs work in the browser.
 * Flip production flags for the all-surfaces deploy.
 */
const isDev = process.env.NODE_ENV === "development";

export const MEMBERSHIP_FEATURE_FLAGS = {
  /** When false: hide country UI, do not require/persist country on onboarding. */
  countryCollectEnabled: isDev,
  /** When true: show EOD cert upload on onboarding only inside Capacitor. */
  eodCertOnboardingNativeOnly: !isDev,
};
