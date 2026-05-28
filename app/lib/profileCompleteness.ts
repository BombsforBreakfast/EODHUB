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
  service?: string | null;
  company_name?: string | null;
  created_at?: string | null;
};

export function hasRequiredSignupNames(profile: SignupProfileFields): boolean {
  return !!(profile.first_name?.trim() && profile.last_name?.trim());
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

  const firstName = profile.first_name?.trim() ?? "";
  const lastName = profile.last_name?.trim() ?? "";
  if (!firstName || !lastName) return false;

  if (isEmployerAccount(profile)) {
    return !!profile.company_name?.trim();
  }

  return !!profile.service?.trim();
}

/** Human-readable missing fields for admin UI. */
export function signupProfileMissingFields(profile: SignupProfileFields): string[] {
  if (profile.is_pure_admin) return [];

  const missing: string[] = [];
  if (!profile.first_name?.trim()) missing.push("first name");
  if (!profile.last_name?.trim()) missing.push("last name");

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
