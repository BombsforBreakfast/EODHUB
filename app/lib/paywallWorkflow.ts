/**
 * Hard suspension of ALL paywall behavior until this moment, regardless of the
 * `NEXT_PUBLIC_PAYWALL_ENFORCED` env var. This is an emergency kill-switch so a
 * stray `NEXT_PUBLIC_PAYWALL_ENFORCED=true` in any deployment can never block,
 * redirect, or charge a member before we intentionally launch.
 *
 * 1 July 2026, 00:00 America/New_York (EDT → UTC-4).
 */
export const PAYWALL_SUSPENDED_UNTIL = new Date("2026-07-01T04:00:00.000Z");

/** True while the global paywall suspension window is still active. */
export function isPaywallSuspended(now: Date = new Date()): boolean {
  return now.getTime() < PAYWALL_SUSPENDED_UNTIL.getTime();
}

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
 *
 * NOTE: While `isPaywallSuspended()` is true, this always returns false even if
 * the env var is set, so no member can be blocked before the suspension lifts.
 */
export function isPaywallEnforced(): boolean {
  if (isPaywallSuspended()) return false;
  return process.env.NEXT_PUBLIC_PAYWALL_ENFORCED === "true";
}

/** @deprecated Use isPaywallEnforced() — kept for existing imports. */
export const PAYWALL_IN_MEMBER_FLOW = isPaywallEnforced();
