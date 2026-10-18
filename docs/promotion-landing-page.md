# EOD-HUB promotion landing page

## Promotion intake and review

The password-gated package buttons open `/promote/request?package=Basic|Featured|Premium`. The wizard captures the selected package, name, email, phone, optional business, promotion type, a brief up to 12,000 characters, optional link/timing, and up to five JPG/PNG/WebP images at 3 MiB each. Advertisers do not need member accounts. The existing shared password is unchanged.

Images upload individually through `/promote/api/requests/...` to stay within hosting request-size limits. Each image is decoded with a 40-million-pixel ceiling, rotated/resized to at most 2400 pixels on either edge, re-encoded to WebP, and stripped of embedded metadata. No SVG, animation, documents or arbitrary binary attachments are accepted. Files reside in the private `promotion-materials` bucket; a restrictive storage policy also protects against legacy broad browser policies.

The draft, attachment list, final status and in-app notification are saved through service-role-only RPCs. Final submission and the single deduplicated bell notification are one database transaction. The server then uses the existing APNs/FCM dispatcher; the normal pending-push cron provides the existing retry path. Device notification permissions/preferences still apply. Push content contains no customer contact details or brief text.

Only the authenticated admin account `micheal.p.twigg@gmail.com` can open this queue. `/admin/promotions` is a responsive review page available inside native apps, linked from the admin panel and admin Hub menu. Notification taps open the individual request there. Admin can read contact details/brief, open short-lived signed image URLs, update review status, and keep private coordination notes. These actions do not publish material, send customer emails, or charge anyone. Email follow-up and Square invoicing remain manual.

Apply `supabase/migrations/20261018093000_promotion_requests.sql` before deploying the intake. It adds only the new table/functions/private bucket/policies and does not rewrite existing jobs/feed/payment data. Server runtime uses the existing Supabase URL, anon key, service role, push settings and shared promotion password. No new billing provider or API key is required.

Anonymous, expired or forged advertiser grants fail closed. Customer mutations also require same-origin requests. Draft access is bound to the individual signed advertiser grant, separate from member access; if the grant expires or changes during a partial upload, unlock and start a fresh request with the retained form fields. API retries reuse the same draft/file IDs; repeated submission does not create a second request or notification. The cleanup cron claims abandoned drafts after 24 hours before deleting their private files; submitted requests are retained.

## Initial brochure release (historical)

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
