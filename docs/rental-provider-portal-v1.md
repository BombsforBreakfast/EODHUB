# Rental provider portal V1

## Scope

The public `/promote/rentals` inventory remains standalone and web-only. `/promote/rentals/portal` adds rental-provider signup, passwordless email-link sign-in, a private property wizard, cart, approval-based billing, availability management, and campaign reports. The owner uses the existing Admin → Rentals section to approve providers and property submissions, manage visibility, upload campaign flyers/reports, and track fulfillment.

The existing three source listings, owner/management contacts, admin availability settings, galleries, pending stamp, service ratings, login page and support components are preserved. Provider inventory is additive. If the new inventory query is unavailable, the page displays a notice while preserving the source listings and their existing availability lookup; it does not invent stale provider inventory.

## Account isolation

New provider identities use Supabase Auth role `eod_rental` plus server-owned `app_metadata.account_type = rental_provider`. The role has no login, superuser, bypass-RLS, or membership inheritance and is deliberately **not granted to PostgREST's authenticator**. Direct Data API/legacy RPC attempts therefore fail before reaching existing Hub tables. Rental operations use authenticated server APIs with a provider-ID ownership predicate; browser clients never receive a service key.

The migration does not replace existing Auth signup functions, change shared schema grants, or modify member RLS policies. A narrowly scoped BEFORE profile-write guard intercepts rental profile inserts and updates. GoTrue admin creation initially inserts a normal placeholder, then assigns the custom role and app metadata inside the same transaction. An additive Auth UPDATE trigger finishes provisioning after those attributes are present: it removes only a placeholder whose creation timestamp and transaction ID match the current transaction, then creates the separate provider record. An established member profile cannot be converted. Existing Auth functions/triggers and normal member writes remain intact. A repair/onboarding endpoint cannot convert a rental account into a Hub profile.

Signup collects full name, optional company, email, phone, and the provider commitment; it never collects or stores a password. The server provisions the rental role before generating a Supabase magic link, and only an existing matching rental identity can receive that link. Link requests are rate-limited per IP and email. A fragment holds the single-use token out of request logs; the provider deliberately selects Continue before verification to protect against link scanners. First successful email confirmation records the application as ready for admin review. Google/Apple are deferred in V1 because any future social flow must preserve this provisioning boundary. No shared Auth templates or settings are changed.

Provider browser sessions use `eodhub-rentals-auth-v1`, independent of the Hub session. Hub API requests from rental bearer/cookie sessions are denied, and rental identities cannot enter protected member routes. Rental account approval changes only the provider record. A member who needs a separate rental identity must use another email (an email alias can share an inbox).

Six new tables have RLS enabled and no browser grants: providers, properties, orders, campaigns, metrics, and rate limits. `rental-assets` is private, with a restrictive policy preventing older broad Storage policies exposing drafts/reports. Ownership-checked short-lived links serve provider/admin media. Public photos resolve only for an approved provider's published, paid, visible property.

## Billing and review

- Each address is one listing; roommate count does not change its fee. A unique per-provider address index prevents duplicate listings.
- Monthly listing: $10. Annual listing: $100. Renewal is opt-in. Availability does not pause a paid term.
- The cart saves a card through Stripe setup mode; no listing payment occurs at setup. A stored order freezes each property's submitted content, fee plan, campaign selection, and consent.
- Account approval precedes submissions. Each property is approved independently; approval creates/reuses its own subscription and optional one-time $50 invoice item. Stripe idempotency keys and recovery lookup prevent repeated approvals creating another subscription.
- Publication follows a successfully paid invoice. Initial failures/authentication requirements stay unpublished; the owner can use the hosted invoice link. Renewal failures receive seven days' grace before the reconciliation cron cancels renewal. Paid time remains available after cancellation.
- Active listing edits keep the approved public version until review and never create another listing fee. Availability/date updates take effect immediately.
- A dedicated Stripe billing portal configuration enables payment-method/invoice management and cancellation without allowing a provider to switch a property to unrelated membership prices.
- Provider terms direct refund requests to EOD-HUB for individual review; cancellation does not automatically issue a refund. Existing arrangements are not migrated into paid billing or charged retroactively.

## Property facts and student commitment

The wizard captures address/installation/type, rental amount/period and room/property basis, beds/baths, minimum lease, deposits/fees/utilities/pets, contact details, description, amenities, and owner-owned photos. Drafts can be saved before completion. Each submission requires photo/advertising authority and the versioned nine-month lease/military-orders termination acknowledgment. All properties offer a nine-month option, with termination for military-ordered relocation even before nine months. Actual lease agreements, applications, rent, deposits, notice, and military orders stay between renter and provider.

## Campaign fulfillment

The $50 add-on buys one branded flyer, Facebook/Instagram posts and Stories, Facebook-only pinning for 30 days, and a final report. V1 fulfillment is manual: the owner uploads files, records post URLs and Stories delivery, and marks placements live. That starts the 30-day clock. `/api/cron/rentals` marks reports due, alerts the owner to unpin/report, and reconciles failed renewals. Social reach/impressions/clicks are entered from the platforms; listing views/contact-button clicks are collected automatically without renter applications or military data. No renter or minimum reach is promised.

## Deployment order and required verification

1. The two migrations were applied after explicit production approval: `20261027231738_rental_provider_portal_v1.sql` and the provisioning-order correction `20261028002502_rental_auth_provisioning_order.sql`. Existing Auth signup function hash and public schema grants were unchanged. Six rental tables and private media storage are present; authenticator cannot assume the rental role.
2. Deploy the scoped branch from the latest remote `main`; never overwrite newer production work. Confirm existing listings/statuses/contacts/ratings and normal member login/support remain intact.
3. Read `/api/cron/rentals?check=1` with the configured `CRON_SECRET` to verify the deployed database, email, webhook, and Stripe mode without creating records or charging anything.
4. Verify actual Supabase Auth signup/login with the dedicated role, no Hub profile, denial of member APIs/Data API/RPCs, and cross-provider ownership restrictions. Cloud integration passed using synthetic accounts/private drafts, all removed afterward: magic-link verification retains the rental role; no Hub profile is created; direct Data API and Storage calls fail; pending-provider writes and foreign property IDs are denied; approved private drafts work; normal member signup is unchanged. Email delivery and full browser payment checkout remain separate checks.
5. Verify Stripe mode and webhook event selections before enabling real customer charges. The available local credential was observed to be **test mode**, not evidence of the production credential's mode. Its test webhook currently lacks some required events; preserve existing selections and add `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.updated`, and `invoice.payment_action_required`. Existing subscription-created/deleted and invoice-succeeded/failed selections must remain.
6. Real Stripe TEST API validation passed with hidden synthetic listings: the monthly first invoice collected $10 + one $50 campaign; annual collected $100; renewal choices were honored; approval retries reused subscriptions; an attached declined card stayed unpublished. Synthetic customers/subscriptions/database records were removed. No live funds or email were used. Full browser Checkout/SCA and actual campaign delivery remain separate manual checks.
7. Confirm the production signing secret matches the correct mode's endpoint and the runtime key. Keep all card data with Stripe; do not store it in application tables.

The current migration SQL hash is recorded with the delivered review copy. The approved schema and Auth-order correction are applied. No existing listing was enrolled in billing and no live financial transaction was performed. Release status is recorded with the delivered implementation report.

## Validation

Passed locally:

- Production-style Next.js 16.1.6 Turbopack build and TypeScript. A temporary filesystem-root setting was needed only because local dependencies were reused through a junction; `next.config.ts` was restored and is unchanged in Git.
- Rental role/API boundaries, mandatory lease/photo acknowledgments, and paid/grace-period rules.
- Passwordless signup with fixed role attributes, no password, existing-identity checks before link generation, per-email limits, fragment-only tokens, and rejection of member or mismatched identities.
- Billing contract tests with all Stripe/network/email operations stubbed: $10/$100 plans, one $50 add-on, opt-in renewal, retries, initial failure staying unpublished, edit approvals without another charge, ordinary member webhook pass-through, stale-event protection, and billing portal product restrictions.
- An isolated PGlite migration test: unchanged existing Auth function/shared grants, normal member profile creation, no rental Hub profiles, PostgREST role isolation, table/media restrictions, atomic/idempotent submissions, owner isolation, address uniqueness, and public-only metrics.
- Existing rental directory, standalone/public/native-access, and service-rating regression scripts.
- Desktop browser inspection of signup/sign-in. Responsive styles are included; physical mobile devices and a live payment checkout have not been tested.

Commands:

```powershell
node --import tsx --test scripts/verify-rental-portal.ts
# NODE_PATH points at Next's bundled server-only marker in this checkout.
node --conditions=react-server --import tsx --test scripts/verify-rental-billing.test.ts scripts/verify-rental-passwordless.test.ts
# PGLITE_MODULE points at a local-only @electric-sql/pglite installation (tested 0.3.15).
node scripts/verify-rental-portal-db.cjs
node --conditions=react-server --import tsx scripts/verify-rental-directory.ts
node --conditions=react-server --import tsx scripts/verify-rental-access.ts
node --import tsx scripts/verify-service-ratings.ts
```
