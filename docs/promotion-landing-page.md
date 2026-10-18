# EOD-HUB promotion intake

## Public customer flow

`/promote` openly shows Basic, Featured and Premium. Package buttons open `/promote/request?package=Basic|Featured|Premium` without a member login or shared password. The wizard captures the selected package, name, email, phone, optional business, promotion type, a brief up to 12,000 characters, optional link/timing, and up to five JPG/PNG/WebP images at 3 MiB each. `promote@eod-hub.com` remains available as a copy-email control; it delivers to Murphy's existing mailbox through an alias.

Before saving, the wizard silently calls `/promote/api/session` to establish/reuse a random 256-bit bearer in a seven-day HttpOnly, SameSite=Lax cookie restricted to `/promote` (Secure in production). Only its hash is stored with the draft. This is anonymous draft ownership, not member/admin authentication; there is no customer read API. Mutations require same-origin requests. Missing or malformed sessions cannot change drafts, and one session cannot upload or submit another session's draft. The old password form, lock control and password endpoint are removed. `PROMOTE_ACCESS_PASSWORD` is no longer used or required.

The existing per-instance limiter allows 60 mutation/session requests per connection per hour. The database additionally allows ten new requests per connection per rolling 24 hours, atomically across instances and browser-cookie resets, using a keyed hash of the network address. Raw IP addresses are not stored in promotion records. The per-session quota also remains ten requests per 24 hours. Retrying the same draft does not consume another request. Shared networks may reach these limits; the error provides the promotion email as a fallback. Honeypot and strict server-side field validation remain enabled.

Images upload individually through `/promote/api/requests/...`. Each is decoded with a 40-million-pixel ceiling, rotated/resized to at most 2400 pixels on either edge, re-encoded to WebP, and stripped of embedded metadata. SVG, animation, documents and arbitrary binary attachments are rejected. Files stay in the private `promotion-materials` bucket, protected by a restrictive storage policy even against legacy broad policies.

API retries reuse draft/file IDs. Final submission and the single deduplicated bell notification are saved in one database transaction. The server then uses the existing APNs/FCM dispatcher; the pending-push cron provides retries. Device notification preferences still apply. Push content contains no customer contact details or brief text. Abandoned drafts/files are claimed and removed after 24 hours; submitted requests are retained.

## Owner review and fulfillment

Only authenticated admin `micheal.p.twigg@gmail.com` can open `/admin/promotions` and its API, including inside the native apps. Notification taps open the individual request. The admin can read the customer brief/contact details, open short-lived signed private images, update status, and keep private notes. Submission does not charge anyone, send customer email, or publish a promotion. Email coordination and Square invoicing remain manual.

Confirm placements, availability, dates and deliverables before invoicing. Production follows verified Square payment; publication is an explicit decision. Thirty-day campaigns begin on publication; Stories retain their normal lifetime. Instagram pinning must be confirmed individually. Keep this purchasing route outside native app navigation and separate from Stripe memberships. Store disclosures need review before introducing sponsored content into the shared feed or Stories.

## Deployment and verification

Apply both migrations in order:

- `20261018093000_promotion_requests.sql`: private requests, notifications and image storage.
- `20261018140000_public_promotion_intake.sql`: persistent source quota and service-role-only public-intake wrapper.

The runtime uses existing Supabase and push configuration. No new API keys, billing integration or promotion password is needed. Page/API responses disable shared caching; the landing page remains noindex.

Check `npm run test:promotions`, TypeScript and targeted ESLint. Verify anonymous landing/wizard access, silent scoped cookie creation/reuse, same-origin enforcement, cross-session isolation, persistent quotas, validated private image uploads, owner-only review, and one notification after retrying submission. This is a web deployment; no iOS/Android binary release is needed.
