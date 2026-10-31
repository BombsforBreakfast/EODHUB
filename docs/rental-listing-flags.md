# Private listing reports and Admin review holds

Each public rental card has a **Flag listing** button. Visitors can report
incorrect details, suspected scams/misleading offers, property condition/safety,
contact problems or another concern. The dialog requires a reason and 15–2,000
characters of detail. Follow-up email is optional and private.

Submitting a flag creates a private report. It never automatically hides,
blacklists, deletes or changes the billing of a property. Reports are not public
ratings, and providers cannot read reporter details or internal review notes.

## Admin → Rentals → Flagged listings

The tab badge counts open/reviewing reports. The paginated queue shows active or
all reports and accepts private notes and Open / In review / Resolved / Dismissed
statuses. Revision checks reject stale review and visibility writes.

With a note, the Hub owner can **Hide listing for review** or **Restore listing
eligibility**. A review hold is independent of a provider's Hide/Show setting:
providers cannot override an Admin hold. The provider portal displays a generic
hold notice and excludes held listings from its Live listings count. Restoring
eligibility still requires owner visibility and the existing paid-term rules.
Resolving/dismissing a report does not automatically restore a held property.

Public page filtering applies holds to both original catalog and portal rentals
before geocoding, so the same visible inventory feeds List and Map. New photo
URL requests and analytics collection also honor holds. If review status cannot
be loaded, inventory stays hidden with an unavailable message. Queries batch IDs
to avoid URL limits or silent result truncation. Already-open pages and previously
issued signed photo URLs are not retroactively revoked; refresh loads the current
inventory and existing signed URLs expire under their original lifetime.

Hiding does not cancel subscriptions, stop renewal or issue refunds. Billing
decisions remain separate in Delisting & refunds. Confirmed delisting stops future billing and creates the applicable annual cash-refund task. Published
and billed records are retained; this release adds no permanent-delete button.

## Storage and abuse controls

Migration `20261031191729_rental_listing_flags.sql` adds RLS-protected
`rental_listing_flags` and `rental_listing_moderation`, plus a service-only invoker
RPC for optimistic moderation changes. Neither browsers nor rental/member roles
can read/write these tables. Server Admin routes require the Hub owner. The only
new public rental API permission is POST `/api/rentals/flags`.

The public handler verifies origin, checks that the target listing is public,
validates bounded input, rate-limits submissions to five per IP/hour, includes
a honeypot and reuses a report UUID on retry. It derives property/owner information
server-side. Random report IDs do not authorize report reads. No IP is stored in
the report; the existing rate limiter separately hashes IPs.

A generic Admin alert is queued in the existing durable mail outbox, at most once
per UTC hour, so public reports cannot flood billing receipt delivery. Its normal
scheduled processing retries email failures. Each report remains in the queue
independently of alert deduplication. No reporter or provider email is sent by a
flag or review action.

## Release checks

Apply the reviewed analytics and flags migrations before releasing the code.
Keep the newly deployed Jobs work when updating the release branch.

Local-only checks include actual Next route handlers with stubbed Supabase HTTP
responses that persist/reload test state, and independent PGlite SQL roundtrips
for the migrations, grants, RLS and stale-write rejection. The full existing
Rentals DB suite verifies member/signup/checkout/billing boundaries. A local
browser demo exercises flag submit → Admin queue → save review → refresh.

After deployment, verify an authorized test draft save/edit/reload and a clearly
identified test flag/review against the hosted backend, then check CSV download,
private API rejection, public pending/contacts/ratings/map, and billing diagnostics.
Do not treat synthetic preview metrics or a mocked route test as a live renter,
charge, hosted account or production database write.
