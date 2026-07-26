import {
  isMembershipCountry,
  isUnitedStatesCountry,
  MEMBERSHIP_COUNTRIES,
  membershipCountryName,
} from "./membershipCountries";

export type MemorialCategory =
  | "military"
  | "leo_fed"
  | "civil_service"
  | "law_enforcement"
  | "federal"
  | "humanitarian_mine_action";

export type MemorialVerificationStatus = "pending" | "approved" | "rejected";

export type MemorialPath = "us" | "international";

export const US_MEMORIAL_CATEGORIES = [
  { value: "military" as const, label: "Military" },
  { value: "leo_fed" as const, label: "LEO/FED" },
];

export const INTERNATIONAL_MEMORIAL_CATEGORIES = [
  { value: "military" as const, label: "Military" },
  { value: "civil_service" as const, label: "Civil Service" },
  { value: "law_enforcement" as const, label: "Law Enforcement" },
  { value: "federal" as const, label: "Federal" },
  { value: "humanitarian_mine_action" as const, label: "Humanitarian Mine Action" },
];

/** Countries for international memorials (U.S. uses the separate U.S. path). */
export const INTERNATIONAL_MEMORIAL_COUNTRIES = MEMBERSHIP_COUNTRIES.filter((c) => c.code !== "US");

export function memorialCategoryLabel(category: string | null | undefined): string {
  switch (category) {
    case "military":
      return "Military";
    case "leo_fed":
      return "LEO/FED";
    case "civil_service":
      return "Civil Service";
    case "law_enforcement":
      return "Law Enforcement";
    case "federal":
      return "Federal";
    case "humanitarian_mine_action":
      return "Humanitarian Mine Action";
    default:
      return "Memorial";
  }
}

export function normalizeMemorialCategory(category?: string | null): MemorialCategory {
  switch (category) {
    case "leo_fed":
    case "civil_service":
    case "law_enforcement":
    case "federal":
    case "humanitarian_mine_action":
    case "military":
      return category;
    default:
      return "military";
  }
}

/** Public calendar/feed: approved only (legacy rows without status treat as approved). */
export function isMemorialPubliclyVisible(row: {
  verification_status?: string | null;
}): boolean {
  const status = row.verification_status ?? "approved";
  return status === "approved";
}

/** Text affiliation line for international (and non-crest) memorials. */
export function memorialAffiliationText(row: {
  category?: string | null;
  service?: string | null;
  organization?: string | null;
  country?: string | null;
  is_international?: boolean | null;
}): string {
  const parts: string[] = [];
  if (row.is_international) {
    const countryName = membershipCountryName(row.country);
    if (countryName) parts.push(countryName);
  }
  parts.push(memorialCategoryLabel(row.category));
  if (row.service?.trim()) parts.push(row.service.trim());
  if (row.organization?.trim()) parts.push(row.organization.trim());
  return parts.join(" · ");
}

export function validateInternationalMemorialInput(input: {
  country: string;
  category: string;
  service: string;
  name: string;
  deathDate: string;
  bio: string;
}): string | null {
  const country = input.country.trim().toUpperCase();
  if (!country || !isMembershipCountry(country) || isUnitedStatesCountry(country)) {
    return "Please select a country (use the U.S. path for United States memorials).";
  }
  if (!INTERNATIONAL_MEMORIAL_CATEGORIES.some((c) => c.value === input.category)) {
    return "Please select a memorial type.";
  }
  if (input.category === "military" && !input.service.trim()) {
    return "Please enter the service or branch.";
  }
  if (!input.name.trim()) return "Full name is required.";
  if (!input.deathDate.trim()) return "Date of death is required.";
  if (!input.bio.trim()) return "Bio is required for international memorials.";
  return null;
}
