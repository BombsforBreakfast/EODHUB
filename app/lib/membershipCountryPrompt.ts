import { MEMBERSHIP_FEATURE_FLAGS } from "./membershipFeatureFlags";

export const PROFILE_COUNTRY_NEEDED_TYPE = "profile_country_needed";

export const PROFILE_COUNTRY_NEEDED_TITLE = "Add your country";

export const PROFILE_COUNTRY_NEEDED_MESSAGE =
  "Please select your country of residence on your profile so we can tailor membership and access.";

/** Deep link that opens Edit Profile and focuses the country dropdown. */
export function profileCountryChallengeHref(userId: string): string {
  return `/profile/${encodeURIComponent(userId)}?challenge=country`;
}

export function viewerNeedsCountryPrompt(profile: {
  country?: string | null;
  account_type?: string | null;
  is_pure_admin?: boolean | null;
} | null | undefined): boolean {
  if (!MEMBERSHIP_FEATURE_FLAGS.countryCollectEnabled) return false;
  if (!profile) return false;
  if (profile.is_pure_admin) return false;
  if (profile.account_type === "business_org") return false;
  const country = typeof profile.country === "string" ? profile.country.trim() : "";
  return !country;
}
