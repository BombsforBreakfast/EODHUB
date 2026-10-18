# Voluntary support for EOD-HUB

Web-only split CTA on login and the Hub menu's bottom row, before ATLW. Both controls are hidden until client platform detection confirms a browser. Installed Capacitor apps receive neither CTA nor payment content. Anonymous browser visitors can contribute without a profile.

This is one-time support for a business, not charitable fundraising, membership, advertising, or a digital purchase. It never reads/writes membership credentials, profiles, entitlements, or verification flags. `/support` remains the help page. `/support-the-hub` and its thank-you page are public, subject to the existing geographic restrictions.

## Configuration

Apply `supabase/migrations/20261018180000_hub_support.sql` before enabling checkout. All three tables and both RPCs are service-role-only. The owner admin can read the most recent 100 attempts at `/admin/hub-support`; no personal supporter data is stored there. Receipts, processing fees, payout reconciliation, and refunds remain in Stripe.

Use dedicated **server-only** environment variables, with distinct production/nonproduction values:

- `STRIPE_SUPPORT_SECRET_KEY`: restricted or secret Stripe API key; never the retired membership key.
- `STRIPE_SUPPORT_WEBHOOK_SECRET`: signing secret for this environment's endpoint.
- `HUB_SUPPORT_MODE`: `test` or `live`. Production refuses test checkout.
- `HUB_SUPPORT_SITE_URL`: canonical return origin only, e.g. `https://eod-hub.com`.
- `HUB_SUPPORT_RATE_SECRET`: independent random secret, used to hash quota identifiers.

No publishable key is needed: the server creates hosted Checkout sessions. No card fields or secret keys reach the client. Stripe activation, payout bank details, business information, receipt settings, and an identifiable statement descriptor must be ready before a live release.

Webhook URL: `/api/webhooks/hub-support`, subscribed to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. Use the Stripe API version matching the installed SDK's default, or Stripe's snapshot-event compatibility for that version. Do not connect the legacy membership webhook. API keys need Checkout session read/write and PaymentIntent read permissions; no customer/account/member writes are needed.

## Payment behavior

Server validates integer USD cents from $1–$500. Same-origin POST, bounded request body, short-term request throttling and a database-enforced 10-new-checkouts/IP/hour quota protect public checkout. IP addresses are keyed hashes, never stored raw; quota rows expire after two days. Browser retry UUIDs reuse the same record and Stripe idempotency key. Reopening an existing Checkout session retrieves it instead of creating a new charge attempt.

Signed, mode-checked Stripe events exclusively confirm payment. A return URL alone never marks it paid. Event application locks the contribution, deduplicates event IDs, checks amount/mode/session/intent, and preserves refunds across out-of-order payment events. Operational failures return non-2xx for Stripe retry. Unrelated events are ignored. The public receipt endpoint reveals only amount/currency/status for an opaque session reference, never email, account, or card data.

## Verify

`npx tsx --test scripts/verify-hub-support.test.ts`, TypeScript, targeted lint, then sandbox checkout (guest, signed-in, custom amount, cancellation, success, webhook duplicate and refund). Verify service-role-only database permissions and native CTA absence. Do not test with a real card until the owner explicitly authorizes a real transaction. Keep old membership configuration untouched.
