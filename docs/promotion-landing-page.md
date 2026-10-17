# EOD-HUB promotion landing page

## Initial scope

`/promote` opens a public inquiry screen with `promote@eod-hub.com` and a password form. A valid shared password reveals the package brochure. All inquiries, materials, approvals, and Square invoices are handled manually by email in this release. There are no campaign uploads, database writes, payment integrations, or automated feed/Story placements.

`promote@eod-hub.com` is configured as a receiving alias for the existing `Hello@eod-hub.com` mailbox.

## Configuration

Set the **server-only** environment variable `PROMOTE_ACCESS_PASSWORD` in the deployment environment. Use a unique random password/passphrase of 16–256 characters. Do not prefix it with `NEXT_PUBLIC_`, commit it, send it in a URL, or reuse an account password. Without a valid setting the page stays locked and email inquiries still work. Set a separate password for previews if needed.

The password is checked on the server. Successful entry issues a signed, random, seven-day HttpOnly cookie restricted to `/promote`, with SameSite=Lax and Secure in production. Changing the configured password invalidates existing access cookies. The protected brochure is server-rendered only after signature and expiry validation. Page/API responses disable shared caching, and the page is marked noindex.

The access endpoint requires a same-origin request, validates input size/type, and uses the existing per-instance rate limiter as an additional check. A shared password is an invitation gate, not identity verification or an asset-safety check. Continue reviewing all material before publication. Any future upload or campaign API needs its own authorization; this cookie is intentionally scoped to the brochure.

## Fulfillment

Confirm actual placements, availability, dates, and deliverables before invoicing. The package cards are initial campaign options, not automatic purchases. Production follows verified payment in Square; publication remains an explicit decision. Do not invoice for features until the team can fulfill them. Thirty-day campaigns begin on publication; temporary Stories retain their normal lifetime. Instagram pinning must be confirmed individually.

Keep this advertiser purchasing route outside the native app navigation. Before introducing sponsored content into the shared member feed or Stories, update store disclosures and review the applicable purchasing rules. Existing Stripe membership handlers must not receive new advertising payment logic without a separately scoped billing implementation.

## Verification

- `npm run test:promote-access`
- `npx tsc --noEmit`
- Targeted ESLint on changed TS/TSX files
- Browser: locked page, wrong password, correct password, refresh, lock, mobile width, and stale member-session flags
- HTTP: no protected brochure in anonymous HTML/RSC, private caching, same-origin enforcement, forged/expired cookies, and ordinary member route restrictions

No Supabase migration or Square credentials are needed for this landing-page release.
