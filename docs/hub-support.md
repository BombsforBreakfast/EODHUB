# Voluntary support for EOD-HUB

Web-only split CTA on login and the Hub menu's bottom row, before ATLW. Both controls are hidden until client platform detection confirms a browser. Installed Capacitor apps receive neither CTA nor payment content. Anonymous browser visitors can contribute without a profile.

Support can be one-time or monthly. One-time and $3 are initially selected, with $1/$3/$5 and custom $1–$500 USD choices. Monthly support is voluntary business support, not charitable fundraising, membership, advertising, or a digital purchase. It never changes profiles, entitlements, or verification flags. `/support` remains the help page. `/support-the-hub`, its thank-you page, and `/support-the-hub/manage` are public, subject to the existing geographic restrictions.

## Configuration

Apply `supabase/migrations/20261018180000_hub_support.sql` before enabling checkout. All three tables and both RPCs are service-role-only. The owner admin can read the most recent 100 attempts at `/admin/hub-support`; no personal supporter data is stored there. Receipts, processing fees, payout reconciliation, and refunds remain in Stripe.

Use dedicated **server-only** environment variables, with distinct production/nonproduction values:

- `STRIPE_SUPPORT_SECRET_KEY`: restricted or secret Stripe API key; never the retired membership key.
- `STRIPE_SUPPORT_WEBHOOK_SECRET`: signing secret for this environment's endpoint.
- `HUB_SUPPORT_MODE`: `test` or `live`. Production refuses test checkout.
- `HUB_SUPPORT_SITE_URL`: canonical return origin only, e.g. `https://eod-hub.com`.
- `HUB_SUPPORT_RATE_SECRET`: independent random secret, used to hash quota identifiers.

No publishable key is needed: the server creates hosted Checkout sessions. No card fields or secret keys reach the client. Stripe activation, payout bank details, business information, receipt settings, and an identifiable statement descriptor must be ready before a live release.

Webhook URL: `/api/webhooks/hub-support`. Preserve the existing events and add `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.updated`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.dispute.closed`, and `radar.early_fraud_warning.created`. Existing events are `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. Match the installed SDK's API version (`2026-03-25.dahlia`); do not connect the legacy membership webhook. Dedicated Support key: Checkout sessions write; Payment Intents, Charges and Refunds, Customers, Products, Prices, Invoices/Invoice Payments, and Subscriptions read; Customer Portal write. Direct subscription/customer/product writes, refund writes, Connect, account settings, payouts and transfers are unnecessary.

## Monthly billing and guest management

Apply `20261102015912_monthly_hub_support.sql` before deploying the new Checkout route. It is additive and preserves the old one-time RPCs for deployment overlap. New subscription, email-outbox and billing-review tables, plus all new RPCs, are service-role-only. Hub members and Rental providers receive no access to them.

Additional server configuration:

- `HUB_SUPPORT_MONTHLY_ENABLED=true` only after live verification; otherwise new monthly checkout is hidden/refused while cancellation remains available.
- `STRIPE_SUPPORT_MONTHLY_PRODUCT_ID`: dedicated monthly Support product. No membership or Rentals prices.
- `STRIPE_SUPPORT_PORTAL_CONFIGURATION_ID`: dedicated active portal; invoice history and payment-method update enabled, cancellation at period end, subscription/customer updates and generic login disabled.
- `HUB_SUPPORT_MANAGE_SECRET`: separate random secret of at least 32 characters for signed links and email lookup hashes.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: existing verified transactional email sender.
- Test delivery is blocked unless its exact recipient is in `HUB_SUPPORT_TEST_EMAIL_ALLOWLIST`. Do not set a test allowlist in production.

Each monthly Checkout creates a distinct Stripe customer. It is never merged with Rentals billing or a Hub profile. `invoice.paid` is the sole recurring-payment authority, with one ledger row per invoice; the first invoice reuses the Checkout reservation. Checkout completion only links the subscription. Actual paid amounts, minus refunds and open/lost disputes, contribute to the monthly funding total; future commitments do not. Failed invoices queue customer and owner email once per invoice and recover automatically after payment. Support status never gates Hub access.

Every monthly paid invoice queues a confirmation email containing the amount, invoice reference and management instructions. Cancellation confirmations explain that future renewals stop; current payments are not automatically refunded. Owner Admin has Confirmed payments / Monthly supporters / Billing review, with manual acknowledgement of reviewed issues. Refunds and disputes are reconciled from the Invoice Payments graph; Stripe remains the place to decide refunds or submit evidence. Fraud/dispute events never automatically refund or cancel support.

Management requests return the same response for matching and unknown emails. Database quotas permit three requests/email/hour and ten/source/hour. Matching recipients receive a signed link for each Support subscription, expiring after one hour. Tokens bind the local subscription, current email hash and payment environment, remain in URL fragments, and are removed from browser history after load. The server rechecks the Stripe customer/subscription/product/amount and requires an isolated customer before opening the portal; client-supplied customer IDs are never accepted. No Hub account or password is created.

The hourly `/api/cron/hub-support` job requires `CRON_SECRET`, reconciles subscriptions in rotation, and retries leased email-outbox deliveries. Sent content is erased after 30 days while dedupe keys remain. For secret rotation, temporarily disable new monthly checkout, rotate the management secret, resync all known Support subscriptions to regenerate email hashes, verify fresh management links, then re-enable checkout. Existing signed links expire and users request a fresh one.

This change preserves the current tax settings and does not add registrations or automatically classify voluntary support as advertising or a charitable donation. Confirm business-support tax treatment before enabling new tax collection.

## Payment behavior

Server validates integer USD cents from $1–$500. Same-origin POST, bounded request body, short-term request throttling and a database-enforced 10-new-checkouts/IP/hour quota protect public checkout. IP addresses are keyed hashes, never stored raw; quota rows expire after two days. Browser retry UUIDs reuse the same record and Stripe idempotency key. Reopening an existing Checkout session retrieves it instead of creating a new charge attempt.

Signed, mode-checked Stripe events exclusively confirm payment. A return URL alone never marks it paid. Event application locks the contribution, deduplicates event IDs, checks amount/mode/session/intent, and preserves refunds across out-of-order payment events. Operational failures return non-2xx for Stripe retry. Unrelated events are ignored. The public receipt endpoint reveals only amount/currency/status for an opaque session reference, never email, account, or card data.

Apply `20261018190000_hub_support_owner_notifications.sql` before deploying owner alerts. Each confirmed live contribution creates one bell notification for the exact owner administrator ID and email. The notification and payment state commit atomically; a durable notification ID prevents additional alerts even if the bell item is archived. No sandbox, pending or expiration event generates an alert. The first paid event schedules native push through the existing APNs/FCM path, respecting the owner's push preference. The existing pending-push sweep is the delivery backstop. Alerts open the owner-only contribution ledger and contain no contributor identity or card details. Push delivery still requires a registered device and notification permission.

The ledger's “Send me a test alert” button calls the owner-authenticated POST endpoint. It takes no recipient or payment input and creates a clearly labelled test notification only for the owner; no contribution is recorded. The button is rate limited and reuses a minute-specific deduplication key.

The test request waits for delivery attempts and reports separate iPhone/Android provider configuration, registered-device and accepted-device counts, and sanitized failure summaries. It never returns device tokens or provider credentials. Provider acceptance is not proof of display on the handset. Ordinary notifications retain their existing background dispatch behavior.

## Verify

Run `node --require ./scripts/register-server-tests.cjs --import tsx --test scripts/verify-hub-support.test.ts scripts/verify-monthly-support.test.ts scripts/verify-owner-admin-access.test.ts`. For isolated SQL checks, provide a locally installed `PGLITE_MODULE` and run `node scripts/verify-monthly-support-db.cjs`. The optional `verify-monthly-support-sandbox.ts` requires an explicitly supplied test Support key and asserts the separate EOD-Hub sandbox account; it runs test clocks, renewals, declines, recovery, a partial refund and cancellation against local Postgres, disables delivered email, and cleans up its clock. Follow with a full build, targeted lint and browser Checkout/management checks. Never run a live-card test without an explicitly authorized transaction.
