/** NATO (32) + Australia + New Zealand — membership allowlist for onboarding/profile. */

export type MembershipCountry = {
  code: string;
  name: string;
};

const MEMBERSHIP_COUNTRIES_UNSORTED: MembershipCountry[] = [
  { code: "AL", name: "Albania" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "CA", name: "Canada" },
  { code: "HR", name: "Croatia" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "ME", name: "Montenegro" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "TR", name: "Türkiye" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

export const MEMBERSHIP_COUNTRIES: MembershipCountry[] = [...MEMBERSHIP_COUNTRIES_UNSORTED].sort((a, b) =>
  a.name.localeCompare(b.name),
);

const MEMBERSHIP_COUNTRY_CODES = new Set(MEMBERSHIP_COUNTRIES.map((c) => c.code));

export const MEMBERSHIP_COUNTRY_HELPER =
  "Membership is currently only available to NATO countries, Australia and New Zealand. If you would like your country to be considered for nomination please contact murphy@eod-hub.com to submit for an addition.";

export const NON_US_CERT_ENCOURAGEMENT =
  "If you are outside the United States, you are strongly encouraged to include your EOD certificate for verification — community vouching may be more difficult.";

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

/**
 * ATLW Hotline is US-only. Null/unknown country (legacy + interim before
 * country collection) still sees it; explicit non-US membership hides it.
 */
export function canAccessAtlwHotline(country: string | null | undefined): boolean {
  const normalized = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (!normalized) return true;
  return normalized === "US";
}
