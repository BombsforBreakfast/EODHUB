export type BillingSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "paused";

export type BillingEntitlementStatus = "active" | "expired";

export function normalizeStripeSubscriptionStatus(
  status: string | null | undefined,
): BillingSubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "cancelled":
      return status === "cancelled" ? "canceled" : (status as BillingSubscriptionStatus);
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past_due";
    default:
      return "expired";
  }
}

export function stripeStatusGrantsMemberAccess(status: BillingSubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

export function subscriptionStatusGrantsEntitlement(status: BillingSubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function revenueCatEventToSubscriptionStatus(
  eventType: string,
  periodType: string | null | undefined,
): BillingSubscriptionStatus {
  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      return periodType === "TRIAL" ? "trialing" : "active";
    case "CANCELLATION":
      return "canceled";
    case "EXPIRATION":
      return "expired";
    case "BILLING_ISSUE":
      return "past_due";
    case "SUBSCRIPTION_PAUSED":
      return "paused";
    default:
      return "active";
  }
}

export function revenueCatEventRevokesEntitlement(eventType: string): boolean {
  return eventType === "EXPIRATION";
}
