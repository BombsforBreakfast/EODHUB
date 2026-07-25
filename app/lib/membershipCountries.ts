/** Initial membership allowlist for onboarding/profile. Expand via nomination. */

export type MembershipCountry = {
  code: string;
  name: string;
};

const MEMBERSHIP_COUNTRIES_UNSORTED: MembershipCountry[] = [
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "NZ", name: "New Zealand" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

export const MEMBERSHIP_COUNTRIES: MembershipCountry[] = [...MEMBERSHIP_COUNTRIES_UNSORTED].sort((a, b) =>
  a.name.localeCompare(b.name),
);

const MEMBERSHIP_COUNTRY_CODES = new Set(MEMBERSHIP_COUNTRIES.map((c) => c.code));

export const MEMBERSHIP_COUNTRY_HELPER =
  "Membership is currently only available to the United States, United Kingdom, Canada, Australia, New Zealand, Germany, France, and Italy. If you would like your country to be considered for nomination please contact murphy@eod-hub.com to submit for an addition.";

export const NON_US_CERT_REQUIRED_MESSAGE =
  "Outside the United States: proof of EOD certification is required for verification.";

export function isMembershipCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  return MEMBERSHIP_COUNTRY_CODES.has(code.trim().toUpperCase());
}

export function membershipCountryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return MEMBERSHIP_COUNTRIES.find((c) => c.code === normalized)?.name ?? null;
}

export function normalizeMembershipCountryCode(code: string | null | undefined): string | null {
  if (!code || typeof code !== "string") return null;
  const normalized = code.trim().toUpperCase();
  return isMembershipCountry(normalized) ? normalized : null;
}

export function isUnitedStatesCountry(code: string | null | undefined): boolean {
  return normalizeMembershipCountryCode(code) === "US";
}

/** Non-US membership countries must upload EOD cert at onboarding. */
export function requiresEodCertForCountry(code: string | null | undefined): boolean {
  if (!code || typeof code !== "string") return false;
  const normalized = code.trim().toUpperCase();
  if (!MEMBERSHIP_COUNTRY_CODES.has(normalized)) return false;
  return normalized !== "US";
}

/**
 * ATLW Hotline is US-only. Null/unknown country (legacy + interim before
 * country collection) still sees it; explicit non-US membership hides it.
 */
export function canAccessAtlwHotline(country: string | null | undefined): boolean {
  const normalized = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (!normalized) return true;
  return normalized === "US";
}
