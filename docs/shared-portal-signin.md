# Shared portal sign-in

One Supabase identity signs in to the Hub, Rentals and Events. Google/Apple,
email/password and one-use email links use the standard browser session.
Existing Hub username/email aliases continue to resolve. Settings are at
`/account`; web identity linking returns through the existing allowlisted
`/auth/callback` path. Native callback behavior is preserved.

## Permissions and counting

- A Hub profile is an explicit Hub access request. Existing profiles, including
  pending applications and legacy rows, remain in the public signup total.
- Rentals/Events-only signups have no Hub profile and add nothing to that total.
  Adding another portal to a Hub account counts that profile exactly once.
- Email ownership must be verified before buyer access or a new portal request.
  Legacy Auth auto-confirmation alone does not establish email ownership.
- Hub approval, rental provider approval and event-organizer approval are
  independent. Coordinator and operator assignments remain event-specific.
- An organizer suspension suppresses coordinator access; independently assigned
  operator access is retained. Global Auth bans suppress every portal.
- Non-Hub identities have an API-only Postgres role. Current-role checks also
  reject stale Hub JWTs after withdrawal. Private APIs check session liveness.

The owner reviews Hub applications in **Admin → Users**, providers in
**Admin → Rentals**, and organizer/merge requests in **Admin → Portal access**.

## Existing duplicate accounts

An account holder can request a merge and verify the other account by one-use
email link. The request then enters owner review. This release provides the
proof/review queue and review notes/rejection, not an automatic data or billing
transfer. Reconciliation remains an explicit administrator operation. Connecting
an unused Google/Apple identity to the current account is self-service.

## Rollout

1. Apply `shared_portal_identity_access` with `portal_auth_settings.enabled=false`.
   It asserts the existing profiles, identities and signup count did not change.
2. Apply `shared_identity_session_validation`. No existing data is updated.
3. Deploy compatible code with `NEXT_PUBLIC_SHARED_PORTAL_AUTH_ENABLED=1` and
   `SHARED_PORTAL_AUTH_ENABLED=1`. Existing Hub sign-in still works. Shared OAuth
   buttons remain disabled until the database switch is on.
4. Verify that deployment, then enable `portal_auth_settings.enabled`. New
   ordinary identities are neutral until they explicitly request Hub access.
5. Verify neutral signup, independent approvals, existing Hub login and count.

`SHARED_ACCOUNT_EMAIL_ENABLED=0` is local QA only. Leave it unset in production
to use the existing Resend sender. Never expose service keys to browser code.
The existing ticketing pilot remains gated by its separate origin/enabled flags;
this release does not enable paid ticket checkout or publish the pilot.

Use forward fixes after activation. An older application deployment may not
understand neutral identities; do not roll back to incompatible login code.

## Verification

106 focused account, ticketing, owner and Rentals billing tests pass. A local
PostgreSQL harness checks triggers/RLS/count preservation and stale JWT denial.
Disposable real GoTrue accounts verified one-use links, password proof,
verified-only buyer access, provider approval, property/event isolation,
organizer suspension, Hub counting/role refresh and immediate sign-out denial.
No real charge or test email was sent. Browser QA covers direct email entry,
shared portal cards, rental application fields and light/dark themes.

Activation verification also covers GoTrue's blank initial role before it sets
the configured default. The forward `shared_identity_initial_role` migration
handles that initial insert without changing any established identity.
`scripts/verify-shared-database.sql` reproduces it in a rolled-back local test.
Administrator failed-login recovery explicitly initializes a Hub request before
approving a newly created neutral identity, preserving the recovery workflow.
