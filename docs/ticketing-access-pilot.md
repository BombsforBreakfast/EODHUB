# Ticketing access and saved-event pilot

This checkpoint includes verified access, scoped invitations, durable event drafts and owner-controlled no-card pilot tickets. It is preview/local only. The separate original local concept demo remains on port 65463. Paid checkout, confirmation-email delivery, refunds, payouts and door scanning remain separate implementation passes.

## Temporary no-card ticket mode

The Hub owner can check **No-card pilot: issue tickets for $0** for an approved event. Coordinators, operators and customers cannot change this switch. It starts off, is saved per event, and is checked again inside the issuance transaction. Returning an event to review automatically switches it off. Normal ticket prices and the standard revenue forecast remain unchanged.

An enabled event allows verified buyers to claim 1–8 tickets of a selected type. The entire pilot order is free: admission, Hub fees and card processing are all zero, with no Stripe request or card form. The original admission value and standard Hub fee are retained as reference fields; pilot orders are explicitly tagged `no_card_pilot` and cannot be counted as paid sales. This mode does not waive processing on a real card transaction.

Every order and its individual QR/manual-code tickets are stored in private, API-only tables. Buyers can retrieve only their own tickets under My tickets, including paginated older orders. An event-level database lock enforces both type capacity and total capacity. A stable buyer/request ID returns the same order on retries, including after the owner switches the pilot off. Disabling the switch prevents new claims and preserves issued tickets. QR tickets are marked pilot-only; door scanning is not connected yet.

`TICKETING_NO_CARD_PILOT_ENABLED=1` is an additional server-only local/Preview flag. It defaults off and cannot override the existing production prohibition. Turning it off hides the temporary UI and disables its API. Before paid launch, disable this server flag as well as removing the temporary control; hiding a checkbox alone must never be used to enforce payment. Keep pilot records separate from future paid orders and live inventory.

Apply `20261105200516_ticketing_no_card_pilot_orders.sql` before enabling the additional flag. It adds private pilot order/ticket tables, the owner-only switch, atomic issuance and inventory RPCs, without changing shared Auth, Hub profiles, Rentals billing or existing event prices. No live Stripe configuration is required.

## Shared project boundary

Use the existing EOD-HUB Supabase project. `ticketing_*` tables have RLS, no direct client grants and service-only functions. Events-only users have the `eod_ticketing` Auth role, which is never granted to PostgREST's authenticator. A narrow profile guard and provisioning finisher prevent their entry into Hub profiles/member counts. Established members are never converted: they reuse their identity and retain their existing Auth role, profile and Hub session.

The migration includes integration assertions against the actual profile triggers. It creates disposable `.invalid` fixtures, verifies ordinary pending Hub profiles and unchanged member count, checks scoped access and protects established members, then removes the fixtures inside the migration transaction. Any failed assertion aborts the migration. Auth references permit the existing account-deletion flow without leaving valid sessions; shared event records can retain a null creator/reviewer.

Ticketing uses its own random 24-hour HttpOnly cookie, scoped to `/api/ticketing`, with only a digest stored in the database. No Supabase access/refresh token is sent to the ticketing browser or written over Hub cookies. Opening an email link removes its token from the URL, automatically verifies it with a POST, then routes to the assigned workspace (administration, coordinator, operator or customer). No intermediate Continue step is needed. Verification still checks a 30-minute, origin-bound login request and consumes the link once. React effect replay shares the in-flight verification; it cannot consume the link twice or cache access after sign-out. Invalid or expired links show the request-email form. Sign-out revokes the ticketing session only.

Operator responses omit drafts, staff rosters, invitations, private profiles belonging to others and audit/financial information. Assignment expiry and revocation are checked on every request. Coordinators can invite/revoke operators within their assigned events; only the verified Hub owner can appoint coordinators or grant new-organizer/customer pilot access. An invitation must match the verified email, expires after seven days, and is invalid if its issuing coordinator loses authority. Preparing an invitation copies a link; no invitation email is sent automatically.

## Configuration

Event details require a start and finish date/time in the event's selected time zone. The finish must be strictly later; overnight events use the following finish date. Both endpoints are saved in the existing private JSON documents, shown on the review screen and coordinator/admin event card, and available when resuming a draft. Older drafts remain editable with an empty finish until completed. There is no schema migration for these fields. Door check-in remains in the next implementation pass.

Events support one initial ticket type plus five additions. Each has a stable ID, custom audience name, USD price (including free) and inventory. Submission checks distinct names/IDs, 1–6 types and total capacity up to 100,000. Legacy single-price drafts still load as General admission. The submitted event includes all types, their combined capacity and minimum admission price.

Tickets, Review and saved coordinator/admin events show a full-capacity revenue forecast. The buyer-paid Hub fee remains $1 + 2% per paid ticket, separate from processing; free tickets have no estimated fees. The organizer bears estimated processing on the entire buyer charge (admission plus Hub fee). Organizer proceeds equal ticket face-value sales less processing, so the Hub fee is not deducted twice. Hub service-fee revenue is gross revenue before operating costs and taxes, not a profit guarantee.

The processor assumption is Stripe's standard U.S. domestic-card pricing, 2.9% + $0.30 per successful paid order, verified against https://stripe.com/pricing on November 3, 2026. It is an estimate, not verification of this account's negotiated rate or future Connect configuration. A local 1–8 tickets-per-order selector models same-type groups and a final partial order, with rounding per transaction. All inventory is assumed sold/claimed; incomplete ticket rows suppress totals. Taxes, refunds, discounts and additional Stripe charges are excluded. Changing the estimate does not edit the event or enable billing. Operators receive no organizer financial preview.

Organizer details autosave privately at account level and prefill later events. Incomplete edits live under the private profile's `_draft` key; they cannot turn a new incomplete profile into a submission-ready organizer. The workspace returns a validated profile plus that person's own pending edits. Existing valid profile details remain available while an edit is unfinished.

The editor autosaves partial fields, ticket types and page position, and flushes on navigation/close/page hide. A separate 24-hour browser-tab recovery record is keyed by verified user ID. Writes use a stable client draft ID, unique save receipt and optimistic revision; repeats acknowledge the existing save, and genuine conflicts preserve local entries. Remounts share the same queued writer and current revision. Background requests include the editor's user ID, which must match the current verified actor. Opening a submitted event without editing does not downgrade its review status. No database migration or Auth changes are required.

All wizard sections are navigable. Completed sections show a check; missing required information shows a yellow exclamation mark and an accessible label. An empty optional flyer is complete. Review stays incomplete until required sections and fresh acknowledgments are complete, and submission remains blocked until then.

- `TICKETING_PILOT_ENABLED=1`: server-only switch. `VERCEL_ENV=production` always disables the pilot.
- `TICKETING_NO_CARD_PILOT_ENABLED=1`: enables the temporary owner switch and $0 ticket flow only within that controlled pilot.
- In local development, `TICKETING_PILOT_ORIGIN=http://127.0.0.1:65464`; loopback origins only.
- In Vercel Preview, the configured branch URL (falling back to deployment URL) is the canonical origin. Use that exact host for the portal, links and API requests.
- `TICKETING_EMAIL_ENABLED=1` enables the existing Resend connection for sign-in delivery. Leave disabled until the migration and controlled Auth check pass.
- `TICKETING_TEST_EMAILS` is an optional comma-separated customer tester allowlist. The owner, existing active ticketing accounts and unexpired invited emails can also request sign-in. No arbitrary public signup in this pilot.
- Existing Supabase server/publishable keys and Resend settings remain server configuration. Never commit `.env` files or reuse live Stripe keys for this pilot.

Uploaded static JPG/PNG/WebP files are bounded, decoded, resized and re-encoded as WebP without original metadata. The private media bucket has a restrictive policy against permissive legacy Storage reads. Flyer APIs enforce uploader/assigned-coordinator/owner access. Pilot pages are excluded from live Hub page-time analytics.

## Validation

The three ticketing migrations are applied to the existing project. Actual GoTrue verification, independent sessions sharing drafts, cross-event denial, revoked operator access and a browser save/restart walkthrough passed with disposable synthetic identities. Existing Auth/profile/count functions retain their original definitions and the live Hub signup count stayed at 2,131. Local owner/invited-user mail delivery is enabled for user-initiated testing; actual email delivery and physical-device testing are still to be completed.

The forward migrations keep the server role away from internal Auth tables and use `PT409` for stale-revision conflicts. Do not use transaction error `40001` for an ordinary business conflict: PostgREST may retry it. Invitation email attestation is supplied from the server-verified actor, never caller JSON. Apply the complete migration chain when setting up another environment.

```powershell
node --import tsx --require ./scripts/register-server-tests.cjs --test scripts/verify-ticketing-revenue.test.ts scripts/verify-ticketing-autosave.test.ts scripts/verify-ticketing-schedule.test.ts scripts/verify-ticketing-local-time.test.ts scripts/verify-ticketing-entry.test.ts scripts/verify-ticketing-access.test.ts scripts/verify-owner-admin-access.test.ts scripts/verify-rental-passwordless.test.ts scripts/verify-rental-billing.test.ts scripts/verify-rental-billing-lifecycle.test.ts scripts/verify-rental-delisting.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build --webpack
npm run test:ticketing-pilot
# With PGLITE_MODULE pointing to an installed PGlite entrypoint:
node scripts/verify-ticketing-pilot-db.mjs
```

Run `scripts/verify-ticketing-database.sql` only inside a transaction that is explicitly rolled back. Workspace-local QA helpers (not application runtime dependencies) exercise local PostgreSQL, real HTTP boundaries and, after applying the migration, disposable real Auth identities and independent HTTP sessions. Email delivery and physical-device behavior still require an actual controlled walkthrough; independent HTTP sessions alone are not a physical phone test.

Before sharing a hosted pilot, verify preview-specific configuration, apply the reviewed migration, test real GoTrue provisioning and confirm the source deployment commit. No production ticket sales or launch are authorized by this checkpoint. Follow the preserve-deployed-work workflow before any release.
