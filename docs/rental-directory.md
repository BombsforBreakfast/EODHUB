# Public rental directory

The first version lives at `/promote/rentals`, outside the signed-in application layout. Browsing properties and contacting the owner by email requires neither an account nor a password. The temporary partner-preview gate was removed on October 20, 2026, after the operator reported approval for the photos and from the property management group.

The former preview password, signing secret, access cookie, and authentication endpoint are no longer used. The feature-specific `RENTALS_PREVIEW_PASSWORD` and `RENTALS_PREVIEW_SESSION_SECRET` environment variables have been removed from Vercel.

Listing records and photo URLs live in `listings.server.ts`, protected by `server-only`, and are passed to the public directory by the server. Public metadata includes the featured property photo. The page remains dynamically rendered with private/no-store responses to avoid stale availability and session-dependent contact UI. The existing production `/promote/*` noindex HTTP policy is retained: anyone can open the shared link, but the page is not intended for search-engine indexing yet.

Email contact is public. The card and gallery inquiry buttons open a contact modal for the selected listing's owner and optional property manager. Owner and management emails are copyable. Terry's personal phone number has been removed entirely from the rental source, UI, and API. Calls go to Rob Brooks Realty's public office number instead. The retired `/api/rentals/owner-contacts` endpoint returns 404 regardless of authentication.

## Standalone web availability

Rentals remain a standalone public web landing page for every visitor, including signed-in members. There is no member shell, chat, member-only contact lookup, homepage rental card, or pop-up navigation entry. Existing protected application routes and APIs retain their original authorization.

Rentals are web-only, including mobile Safari and Chrome. `RentalsWebGate` detects the existing Capacitor iOS/Android shell and replaces the listings with a web-only notice and a return-to-app link. The initial content stays hidden until platform detection completes. No native rental navigation or advertiser purchase flow is added.

Run `node --conditions=react-server --import tsx scripts/verify-rental-access.ts` with the same `NODE_PATH` described below for standalone/public, retired phone source/API, no member shell/chat, and native-platform regression checks.

## Updating listings

The landing-page introduction does not feature an individual property. All rentals appear together in the same card grid, with their existing galleries and contact modals.

An owner/manager invitation below the listings offers copy-to-clipboard contact at `hello@eod-hub.com` for paid rental advertising. The following fine print explicitly disclaims EOD-HUB sponsorship, endorsement, and recommendation. This is an inquiry CTA only, not an advertiser checkout or subscription purchase flow.

The owner record includes an optional property-management contact. Terry's record lists Rob Brooks Realty, Realtor Atresia, the public management phone, email, and external rental application URL. Owner and management emails use copy buttons via the existing web/native clipboard helper, with success feedback and a selectable manual-copy field if clipboard access is blocked. Only the management office phone is provided; Terry remains reachable by email. Application links open the supplied management website in a new tab; EOD-HUB does not collect applications.

The entire search/filter panel is currently hidden because inventory is limited to three Niceville listings. Search, availability, owner, 50-state filtering, and reset logic remain wired. Pass `showFilters={true}` to `RentalDirectory` in the rentals page to restore the panel; also pass `showStateFilter={true}` when broader inventory is ready to restore its four-field layout.

Edit `app/lib/rentals/listings.server.ts` to add properties or update rent and contacts. Change existing property availability through Admin → Rentals. Owners have independent IDs; several properties can reference the same owner. Each listing needs a stable unique ID and an existing owner ID. All 50 states are supported in the state filter, including states without inventory. The free-text search includes cities, ZIP codes, full state names, nearby bases, features, and owners.

Run `node --conditions=react-server --import tsx scripts/verify-rental-directory.ts` for catalog checks with `NODE_PATH` pointing to `node_modules/next/dist/compiled`, where Next.js bundles its server-only marker. Verify that an anonymous visitor sees all three listings without a password, the old preview endpoint is absent, and the retired phone API returns 404 with or without authorization.

Availability is explicitly owner-provided, not synchronized with Zillow or a booking system. New properties can use these source defaults until settings are saved through Admin:

```ts
{ status: "available-now" }
{ status: "available-from", date: "2026-12-01" }
{ status: "pending" }
{ status: "unavailable" }
```

The admin editor updates the availability timestamp automatically. A projected availability date is displayed only when supplied; change the status explicitly when the property becomes available. Zillow sale prices and mortgage estimates never determine the advertised rental price.

## Photos

`app/lib/rentals/zillow-photos.json` records the property-specific gallery URLs found in the public Zillow listing data on October 20, 2026. The first photo is the card cover. Photos render inside the EOD-HUB gallery but remain hosted by Zillow. No scraping runs during page requests. Zillow listing links have been removed from the interface and public catalog; contact actions point directly to the owner. If a source image disappears, the gallery presents a fallback directing visitors to the owner. Keep the owner's and property management group's written approvals with the project records. Replace these remote URLs with authorized owner-supplied originals hosted in EOD-HUB storage when available. The contact information and advertised rent come from the supplied owner details.

## Future expansion

The owner/listing separation can map to database tables without changing the directory's component contract. A later owner dashboard can publish availability and photo updates. Any recurring listing subscription should have its own Stripe product and price, separate from social-media advertising fees. This version makes no payment or verification claims and does not take applications or deposits.

## Service ratings and testimonials

Unit 158 is pending and Unit 139 is available as of October 24, 2026. Its diagonal electric-yellow stamp overlays the photo without intercepting clicks; gallery and contacts remain available.

A separate section rates EOD-HUB as a listing service, not individual properties. Scores accept 0.5–5 bombs in half-bomb increments. `/api/rentals/service-rating` stores one editable rating per anonymous browser cookie in `listing_service_ratings`, with optional display name and testimonial. A public testimonial requires explicit publication consent. The top of the page shows the shared average, count, half-bomb distribution, and three featured ratings/testimonials. The submission form remains below the listings. Anonymous browser ratings are not verified renter reviews and clearing cookies permits another rating. No sample reviews or ratings are seeded.

The table has RLS enabled and no direct anon/authenticated access. The API uses the server service role, validates score and text lengths, checks same-origin writes, and briefly throttles updates. Only aggregate scores and volunteered testimonial fields are returned publicly; visitor IDs stay server-side. Submission errors remain visible. Removing testimonial text and updating removes it from public display.

### Featured feedback and all ratings

The top summary stays hidden until at least one rating exists. The submission form remains at the bottom, and a successful first submission reveals the top summary immediately. The average and distribution include all scores, including ratings without written testimonials. Default order: pinned first, highest score, then newest creation date within each score. The Show all ratings modal supports featured, highest, newest, and lowest sorting, 20 results per page, and Load more. Alternate sorts include every rating without prioritizing pins. Public review UUIDs are separate from private visitor UUIDs.

Existing signed-in admins (profiles.is_admin) see Pin/Unpin feedback controls on featured cards and all modal cards. Open Show all ratings to find any review. PATCH validates the bearer token with getUser and reads admin status server-side. Pinning changes is_pinned only, without changing scores or dates. Public pinned labels identify featured selections. Sign in through EOD-HUB and return to the rentals page to manage feedback.

Run node --import tsx scripts/verify-service-ratings.ts for mocked API authorization, pin/unpin, sorting, pagination, and consent checks. Database average/count and pin ordering were separately verified in a rolled-back transaction; no test ratings are published.

The top summary is compact: a Community feedback label, average, bomb icons and rating count. The score distribution starts collapsed; Rating breakdown toggles it beside the first-rating link. Show all ratings opens the modal without explanatory copy below the summary.

Units 139 and 158 use `contactMode: "owner-only"` and show Terry directly, without management details or an application link. The Muirfield listing retains Rob Brooks Realty. Property containers, the rating form, and the advertiser invitation sit on the page background without card borders or side padding. Mobile properties have divider lines; monthly prices sit beside addresses, with wrapping on narrower screens.

## Owner-managed availability

The owner account has a Rentals tab in the Admin panel, including the mobile section selector. Each property supports Available, Pending or Unavailable plus an independent optional projected availability date. Save availability applies the change immediately to subsequent public page loads; clearing the date and saving removes it. Dates do not automatically change the status.

`rental_listing_status` stores these settings independently of the source catalog so deployments cannot overwrite admin edits. The dynamic rental page merges saved settings into catalog listings; catalog status is only a default for newly added properties without a settings row. Database failures do not silently restore stale catalog availability. The owner-only API authenticates the user and admin profile server-side, rejects unknown properties and invalid dates, and records the editor and update timestamp. RLS is enabled with no direct browser grants or policies; the server uses the service role.
