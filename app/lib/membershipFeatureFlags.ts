/**
 * Membership country + EOD cert onboarding surfaces.
 * Enabled on web and native (Capacitor loads the same deployed web app).
 */
export const MEMBERSHIP_FEATURE_FLAGS = {
  /** When false: hide country UI, do not require/persist country on onboarding. */
  countryCollectEnabled: true,
  /** When true: show EOD cert upload on onboarding only inside Capacitor. */
  eodCertOnboardingNativeOnly: false,
};
