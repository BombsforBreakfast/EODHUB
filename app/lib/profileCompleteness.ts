/** Allowed member service values — keep in sync with onboarding UI. */
export const MEMBER_SERVICE_OPTIONS = [
  "Army",
  "Navy",
  "Marines",
  "Air Force",
  "Civil Service",
  "Federal",
  "Civilian Bomb Tech",
] as const;

export const MEMBER_STATUS_OPTIONS = [
  "Active Duty",
  "Former",
  "Retired",
  "Civil Service",
] as const;

/**
 * Profiles created before this moment are grandfathered: they may lack first/last
 * name (or service) and can still be verified by admins or vouched in.
 */
export const SIGNUP_PROFILE_ENFORCEMENT_START = "2026-05-28T00:00:00.000Z";

export type SignupProfileFields = {
  is_pure_admin?: boolean | null;
  account_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  /** Mirrored OAuth / display label — may exist while first/last columns are empty. */
  name?: string | null;
  display_name?: string | null;
  service?: string | null;
  company_name?: string | null;
  created_at?: string | null;
};

/** Best-effort split of a full name string into first + last. */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export const SIGNUP_FULL_NAME_REQUIRED_MESSAGE =
  "Please enter your first and last name.";

/** Split a single full-name field into first + last; null when last name is missing. */
export function parseSignupFullName(fullName: string): {
  firstName: string;
  lastName: string;
} | null {
  const parsed = splitFullName(fullName);
  if (!parsed.first_name || !parsed.last_name) return null;
  return { firstName: parsed.first_name, lastName: parsed.last_name };
}

/** Read display name from Supabase Auth user_metadata (Google OAuth, etc.). */
export function authMetadataDisplayName(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const full =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    "";
  if (full) return full;
  const given = typeof metadata.given_name === "string" ? metadata.given_name.trim() : "";
  const family = typeof metadata.family_name === "string" ? metadata.family_name.trim() : "";
  const combined = [given, family].filter(Boolean).join(" ");
  return combined || null;
}

/**
 * Resolve signup first/last from profile columns, falling back to mirrored
 * OAuth name or display_name (same sources the admin UI uses for labels).
 */
export function resolveSignupNames(profile: SignupProfileFields): {
  first_name: string;
  last_name: string;
} {
  const existingFirst = profile.first_name?.trim() ?? "";
  const existingLast = profile.last_name?.trim() ?? "";
  if (existingFirst && existingLast) {
    return { first_name: existingFirst, last_name: existingLast };
  }

  const label =
    profile.display_name?.trim() ||
    profile.name?.trim() ||
    "";
  if (!label) {
    return { first_name: existingFirst, last_name: existingLast };
  }

  const parsed = splitFullName(label);
  return {
    first_name: existingFirst || parsed.first_name,
    last_name: existingLast || parsed.last_name,
  };
}

export function hasRequiredSignupNames(profile: SignupProfileFields): boolean {
  const { first_name, last_name } = resolveSignupNames(profile);
  return !!(first_name && last_name);
}

/** Legacy accounts keep existing access even when name/service fields are empty. */
export function isGrandfatheredSignupProfile(profile: SignupProfileFields): boolean {
  if (!profile.created_at) return true;
  return profile.created_at < SIGNUP_PROFILE_ENFORCEMENT_START;
}

/** Block admin approval / vouching for new accounts missing required signup names. */
export function blocksSignupApproval(profile: SignupProfileFields): boolean {
  if (profile.is_pure_admin) return false;
  if (isGrandfatheredSignupProfile(profile)) return false;
  return !hasRequiredSignupNames(profile);
}

export function isEmployerAccount(profile: SignupProfileFields): boolean {
  return profile.account_type === "employer" || !!profile.company_name?.trim();
}

/** True when first name, last name, and service (member) or company (employer) are present. */
export function isSignupProfileComplete(profile: SignupProfileFields): boolean {
  if (profile.is_pure_admin) return true;

  const { first_name: firstName, last_name: lastName } = resolveSignupNames(profile);
  if (!firstName || !lastName) return false;

  if (isEmployerAccount(profile)) {
    return !!profile.company_name?.trim();
  }

  return !!profile.service?.trim();
}

/** Human-readable missing fields for admin UI. */
export function signupProfileMissingFields(profile: SignupProfileFields): string[] {
  if (profile.is_pure_admin) return [];

  const { first_name, last_name } = resolveSignupNames(profile);
  const missing: string[] = [];
  if (!first_name) missing.push("first name");
  if (!last_name) missing.push("last name");

  if (isEmployerAccount(profile)) {
    if (!profile.company_name?.trim()) missing.push("company name");
  } else if (!profile.service?.trim()) {
    missing.push("service");
  }

  return missing;
}

export function validateMemberOnboardingInput(input: {
  firstName: string;
  lastName: string;
  service: string;
  status: string;
}): string | null {
  if (!input.firstName.trim()) return "First name is required.";
  if (!input.lastName.trim()) return "Last name is required.";
  if (!input.service.trim()) return "Service is required.";
  if (!(MEMBER_SERVICE_OPTIONS as readonly string[]).includes(input.service)) {
    return "Invalid service selection.";
  }
  if (!input.status.trim()) return "Status is required.";
  if (!(MEMBER_STATUS_OPTIONS as readonly string[]).includes(input.status)) {
    return "Invalid status selection.";
  }
  return null;
}

export function validateEmployerOnboardingInput(input: {
  firstName: string;
  lastName: string;
  companyName: string;
}): string | null {
  if (!input.firstName.trim()) return "First name is required.";
  if (!input.lastName.trim()) return "Last name is required.";
  if (!input.companyName.trim()) return "Company name is required.";
  return null;
}
