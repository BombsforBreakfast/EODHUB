/**
 * Profile account_type helpers. Employer-only tooling must use isEmployerAccountType
 * (account_type === "employer" only), not is_employer alone, so organization profiles
 * never inherit recruiting/dashboard access.
 */

export type CommunityAccountType = "member" | "organization";

export function isEmployerAccountType(accountType: string | null | undefined): boolean {
  return accountType === "employer";
}

export function isOrganizationAccountType(accountType: string | null | undefined): boolean {
  return accountType === "organization";
}

export function isCommunityMemberAccountType(accountType: string | null | undefined): boolean {
  return accountType === "member" || accountType === "organization";
}

/** Rectangular logo / wider header chrome — layout only, not permissions. */
export function usesRectangularProfileChrome(accountType: string | null | undefined): boolean {
  return accountType === "employer" || accountType === "organization";
}
