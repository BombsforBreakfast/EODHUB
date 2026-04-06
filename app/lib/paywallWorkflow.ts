/**
 * Legacy flag: previously gated the home redirect + some APIs when both this and
 * NEXT_PUBLIC_PAYWALL_ENABLED were true. Home now uses date-based trial logic in
 * subscriptionAccess.ts (soft gate + modal). Some call sites may still import this
 * for backwards compatibility — keep exports stable.
 */
export const PAYWALL_IN_MEMBER_FLOW = true;
