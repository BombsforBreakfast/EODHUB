# Ticketing access and saved-event pilot

This checkpoint replaces demo role selection with server-verified email sign-in, scoped invitations and durable event drafts. It is preview/local only. The separate original local concept demo remains on port 65463. Checkout, ticket issuance, customer order management and scanning are the next implementation pass; the new workspace must not claim they are ready.

## Shared project boundary

Use the existing EOD-HUB Supabase project. `ticketing_*` tables have RLS, no direct client grants and service-only functions. Events-only users have the `eod_ticketing` Auth role, which is never granted to PostgREST's authenticator. A narrow profile guard and provisioning finisher prevent their entry into Hub profiles/member counts. Established members are never converted: they reuse their identity and retain their existing Auth role, profile and Hub session.

The migration includes integration assertions against the actual profile triggers. It creates disposable `.invalid` fixtures, verifies ordinary pending Hub profiles and unchanged member count, checks scoped access and protects established members, then removes the fixtures inside the migration transaction. Any failed assertion aborts the migration. Auth references permit the existing account-deletion flow without leaving valid sessions; shared event records can retain a null creator/reviewer.

Ticketing uses its own random 24-hour HttpOnly cookie, scoped to `/api/ticketing`, with only a digest stored in the database. No Supabase access/refresh token is sent to the ticketing browser or written over Hub cookies. Email tokens require an explicit Continue POST and are checked against a 30-minute, origin-bound login request before a single-use verification. Sign-out revokes the ticketing session only.

Operator responses omit drafts, staff rosters, invitations, private profiles belonging to others and audit/financial information. Assignment expiry and revocation are checked on every request. Coordinators can invite/revoke operators within their assigned events; only the verified Hub owner can appoint coordinators or grant new-organizer/customer pilot access. An invitation must match the verified email, expires after seven days, and is invalid if its issuing coordinator loses authority. Preparing an invitation copies a link; no invitation email is sent automatically.

## Configuration

- `TICKETING_PILOT_ENABLED=1`: server-only switch. `VERCEL_ENV=production` always disables the pilot.
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
node --import tsx --require ./scripts/register-server-tests.cjs --test scripts/verify-ticketing-access.test.ts scripts/verify-owner-admin-access.test.ts scripts/verify-rental-passwordless.test.ts scripts/verify-rental-billing.test.ts scripts/verify-rental-billing-lifecycle.test.ts scripts/verify-rental-delisting.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/next/dist/bin/next build --webpack
```

Run `scripts/verify-ticketing-database.sql` only inside a transaction that is explicitly rolled back. Workspace-local QA helpers (not application runtime dependencies) exercise local PostgreSQL, real HTTP boundaries and, after applying the migration, disposable real Auth identities and independent HTTP sessions. Email delivery and physical-device behavior still require an actual controlled walkthrough; independent HTTP sessions alone are not a physical phone test.

Before sharing a hosted pilot, verify preview-specific configuration, apply the reviewed migration, test real GoTrue provisioning and confirm the source deployment commit. No production ticket sales or launch are authorized by this checkpoint. Follow the preserve-deployed-work workflow before any release.
