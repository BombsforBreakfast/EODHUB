# Rentals engagement analytics

Admin → Rentals now has **Manage rentals** and **Analytics** tabs. Analytics has
**Properties** and **EOD Home Buying** reports. Owners have an **Analytics** tab in
their property portal; it only queries properties belonging to the verified
rental account. Rental login and Hub member permissions do not change.

Property reports filter by owner (Admin), state, property and dates. Choose the
last 7/30/90 days or a custom inclusive UTC range of up to 366 days. The overview,
daily chart and table follow the same filters. Refresh explicitly for new counts.
The export is daily data for exactly the current selection, including state,
city, owner, property and IDs so recipients can filter or create a pivot table.
Properties with no recorded events have a zero row with a blank activity date.
Exports contain no visitor identities. UTF-8 BOM and CSV quoting support Excel;
formula-like owner-entered text is neutralized before export.

## Definitions

* Listing/ad appearances: at least half of a property's cover photo or the ad
  logo becomes visible. Counts use the image rather than the entire tall card.
* Property opens: opens of that property's photo gallery, not selection of a
  shared map pin or changing photos inside an already-open gallery.
* Contact opens: opening the property's Ask about this rental dialog.
* Email copies: successful copying of an owner or manager email for the property.
* Phone clicks: activation of a property's owner/manager telephone link.
* Application links: activation of an external management application link.
* Logo clicks: clicks on the EOD Home Buying logo, with its existing UTMs.

An action is counted at most once per property/ad and kind per 30 minutes in one
tab, using sessionStorage with an in-memory fallback. These are interaction
counts, not unique people, confirmed inquiries, calls, applications or rentals.
Different tabs, blocked storage, browser privacy tools and automated traffic can
affect totals. The public endpoint rejects unknown/nonpublic inventory and
obvious bots and retains the existing database-backed request rate limit.

The EOD Home Buying dashboard uses these same first-party aggregate rules.
Existing Vercel `rentals_ad_click` tracking remains in place for reference, but
Vercel can count more repeated clicks because it does not use this local dedupe.

## Data and access

`rental_engagement_daily` stores UTC day, subject type/ID, owner ID and aggregate
counts. It includes original catalog IDs and portal UUIDs. No visitor identifiers,
IP addresses, user agent strings, emails, full browsing sessions or contact
details are stored in analytics. Random event receipts provide seven-day retry
idempotency and are pruned on ingestion; they do not identify visitors. The
existing rate-limit service separately hashes IPs for abuse control.

Both new tables use RLS with no public/member/provider grants. The invoker RPC
is executable only by service_role. Read APIs authorize before using the service
client: `/api/admin/rentals/analytics` requires the Hub owner; the rental portal
endpoint always scopes the catalog to the verified provider ID and rejects
cross-owner/property/ad selections. All report responses are private/no-store.
Results paginate explicitly and property filters are batched to avoid URL size
and default row limits. Large reports fail clearly rather than truncate.

Original catalog properties appear in Admin analytics. They do not automatically
become owned by a rental account with a matching email/name; that requires an
explicit ownership migration. No accounts are created or linked by this change.

## Migration and rollout

Review/apply `20261031191913_rental_engagement_analytics.sql` before releasing code.
It backfills existing portal impressions/contact counts, preserves the original
summary table, and bridges the old metric writer so deployment-time/older-client
events reach both summaries. New gallery/direct-contact/ad counts and original
property counts start at activation; their past history cannot be reconstructed.
Existing approvals, billing, webhook flows, auth guards, member counts, service
ratings, property contacts and map behavior remain unchanged.

Local checks:

```powershell
$env:NODE_PATH=(Resolve-Path node_modules/next/dist/compiled).Path
node --conditions=react-server --import tsx --test scripts/verify-rental-analytics.test.ts scripts/verify-rental-engagement-client.test.ts
# Point PGLITE_MODULE at the local-only @electric-sql/pglite package.
node scripts/verify-rental-analytics-db.cjs
node scripts/verify-rental-portal-db.cjs
node --conditions=react-server --import tsx scripts/verify-rental-directory.ts
node node_modules/typescript/bin/tsc --noEmit
```

The wizard review also replaces raw validation output with four concise, linked
completion sections. Submission remains blocked until the existing property
schema passes. No requirements are removed.
