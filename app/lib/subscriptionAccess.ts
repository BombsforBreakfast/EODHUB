import { isPaywallEnforced } from "./paywallWorkflow";

/**
 * Member subscription / trial access (EOD HUB).
 *
 * Beta: isPaywallEnforced() === false → all members have full access (no subscription friction).
 * Launch (PAYWALL_ENFORCED=true): trial windows below, then Stripe active/trialing required.
 * Employers and admins are always exempt.
 */
export { isPaywallEnforced } from "./paywallWorkflow";
export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

/** 1 June 2026, 00:00 in America/New_York (EDT → UTC-4) */
export const PAYWALL_LAUNCH_END = new Date("2026-06-01T04:00:00.000Z");

/** 8 June 2026, 00:00 in America/New_York — first billing for pre-launch signups */
export const LEGACY_TRIAL_BILLING_START = new Date("2026-06-08T04:00:00.000Z");

export type MemberAccessInput = {
  accountType: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  authUserCreatedAtIso: string | null | undefined;
  isAdmin?: boolean | null;
  now?: Date;
};

function parseSignup(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isPaidSubscriptionStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/** Full member access: paid subscription, in-app trial, launch calendar, admin, or employer. */
export function memberHasInteractionAccess(input: MemberAccessInput): boolean {
  if (!isPaywallEnforced()) return true;

  const now = input.now ?? new Date();
  if (input.isAdmin) return true;
  if (input.accountType === "employer") return true;

  if (isPaidSubscriptionStatus(input.subscriptionStatus)) return true;

  if (now.getTime() < PAYWALL_LAUNCH_END.getTime()) return true;

  const signupAt = parseSignup(input.authUserCreatedAtIso);
  if (!signupAt) return false;

  if (signupAt.getTime() < PAYWALL_LAUNCH_END.getTime()) {
    return now.getTime() < LEGACY_TRIAL_BILLING_START.getTime();
  }

  const trialEnds = signupAt.getTime() + TRIAL_MS;
  return now.getTime() < trialEnds;
}

/**
 * Unix seconds for Stripe subscription trial_end (first charge), or undefined if user should be charged immediately.
 */
export function computeStripeTrialEndUnix(
  authUserCreatedAtIso: string,
  now: Date = new Date()
): number | undefined {
  if (!isPaywallEnforced()) return undefined;

  const signupAt = parseSignup(authUserCreatedAtIso);
  if (!signupAt) return undefined;

  let billingStartsAt: Date;
  if (signupAt.getTime() < PAYWALL_LAUNCH_END.getTime()) {
    billingStartsAt = LEGACY_TRIAL_BILLING_START;
  } else {
    billingStartsAt = new Date(signupAt.getTime() + TRIAL_MS);
  }

  if (billingStartsAt.getTime() <= now.getTime()) return undefined;
  return Math.floor(billingStartsAt.getTime() / 1000);
}
