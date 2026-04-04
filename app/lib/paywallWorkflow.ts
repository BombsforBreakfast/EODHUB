/**
 * Member paywall (home → /subscribe when not active/trialing).
 *
 * Keep `false` during beta so verified members reach the app without Stripe.
 * When launching: set to `true` and set `NEXT_PUBLIC_PAYWALL_ENABLED=true` in env.
 *
 * Stripe routes, `/subscribe`, webhooks, and profile billing UI stay in place either way.
 */
export const PAYWALL_IN_MEMBER_FLOW = false;
