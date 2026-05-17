/**
 * Paywall master switch (Beta vs full launch).
 *
 * During Beta: leave `NEXT_PUBLIC_PAYWALL_ENFORCED` unset or `false`.
 *   - No subscribe redirects or interaction paywalls; full access for all members.
 *   - Onboarding still shows subscription disclosure + acknowledgement (informational only).
 *
 * At full launch: set `NEXT_PUBLIC_PAYWALL_ENFORCED=true` in the deployment env.
 *   - Date/trial rules in subscriptionAccess.ts apply.
 *   - Redirects, interaction gates, and Stripe checkout enforcement activate.
 */
export function isPaywallEnforced(): boolean {
  return process.env.NEXT_PUBLIC_PAYWALL_ENFORCED === "true";
}

/** @deprecated Use isPaywallEnforced() — kept for existing imports. */
export const PAYWALL_IN_MEMBER_FLOW = isPaywallEnforced();
