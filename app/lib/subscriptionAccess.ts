/**
 * Member subscription / trial access (EOD HUB).
 *
 * Profiles with `is_admin: true` always receive interaction access here (QA / operations).
 *
 * Launch: full access until PAYWALL_LAUNCH_END (1 June 2026 00:00 America/New_York).
 * After launch:
 *   - Users who signed up before launch: in-app trial from launch through LEGACY_TRIAL_BILLING_START (8 June 2026 00:00 NY).
 *   - Users who sign up on or after launch: 7 calendar days from signup.
 * Stripe status active/trialing always grants interaction access.
 */

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

/** Browsing / tab navigation — always allowed for verified users (handled by auth routes). */
export function memberHasInteractionAccess(input: MemberAccessInput): boolean {
  const now = input.now ?? new Date();
  if (input.isAdmin) return true;
  if (input.accountType === "employer") return true;

  const status = input.subscriptionStatus ?? null;
  if (status === "active" || status === "trialing") return true;

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
