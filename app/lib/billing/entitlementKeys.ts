/** Canonical entitlement keys stored in billing_entitlements. */
export const EODHUB_MEMBER_ENTITLEMENT = "eodhub_member";

/** RevenueCat entitlement identifier — maps to EODHUB_MEMBER_ENTITLEMENT in webhooks. */
export const REVENUECAT_MEMBER_ENTITLEMENT = "member_access";

export function mapRevenueCatEntitlementToDbKey(rcEntitlementId: string): string | null {
  if (rcEntitlementId === REVENUECAT_MEMBER_ENTITLEMENT) return EODHUB_MEMBER_ENTITLEMENT;
  return null;
}

export function entitlementKeysFromRevenueCat(rcEntitlementIds: string[] | null | undefined): string[] {
  if (!rcEntitlementIds?.length) return [EODHUB_MEMBER_ENTITLEMENT];
  const mapped = rcEntitlementIds
    .map(mapRevenueCatEntitlementToDbKey)
    .filter((k): k is string => k != null);
  return mapped.length ? mapped : [EODHUB_MEMBER_ENTITLEMENT];
}
