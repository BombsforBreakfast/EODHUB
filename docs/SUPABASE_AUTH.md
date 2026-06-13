# Supabase Auth configuration (EOD HUB)

Product-level email verification is handled by the app (Resend) **after onboarding**. Supabase Auth should not send a separate confirmation email that blocks signup.

## Required dashboard settings

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Providers** → **Email**.
2. **Disable** “Confirm email” (or enable **auto-confirm** for new users, depending on your Supabase UI version).
3. Save changes.

With auto-confirm enabled, password signups receive a session immediately and proceed to `/onboarding`. After onboarding, users receive a branded Resend link (`POST /api/auth/send-verification-email`) before entering the admin review queue.

## Google OAuth

Google signups skip the Resend verification step; their profile is set to `email_verified = true` at onboarding completion and enter `pending_admin_review` directly.

## Apple Sign In

See **[APPLE_AUTH.md](./APPLE_AUTH.md)** for Apple Developer + Supabase provider setup. Apple signups follow the same trusted-OAuth path as Google (skip Resend, go to `/pending` after onboarding).

## Migration

Apply `supabase/migrations/20260519120000_email_verification.sql` to add `email_verified`, `admin_verified`, `email_verified_at`, and `email_verification_tokens`.

## Test on localhost

### Prerequisites

1. Run the migration on your Supabase project (SQL Editor or `supabase db push`).
2. Supabase **Email** provider: confirm email **off** / auto-confirm **on** (see above).
3. `.env.local` must include `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and your Supabase URL/anon key.
4. Restart `npm run dev` after any `.env.local` change.

Verify links in dev use `http://localhost:3000` automatically when you trigger send from the local app (even if `NEXT_PUBLIC_APP_URL` points at production).

### Password signup path (full flow)

1. `npm run dev` → open [http://localhost:3000/login](http://localhost:3000/login).
2. Sign up with a **real inbox** you can open (Resend must be allowed to send to that address).
3. Complete onboarding as a **member** or **employer** (not Google — Google skips email verify).
4. You should land on `/verify-email` and receive **Verify your email — EOD HUB** from Resend.
5. Click **Verify Email** in the message → `/email-verified` → profile becomes `pending_admin_review`.
6. Sign in again → `/pending` (admin/vouch wait). Feed (`/`) should still block until approved.

### Quick checks without email

**Resend from UI:** On `/verify-email`, use **Resend verification email** (rate limited).

**Simulate link click** (Supabase SQL Editor or Table Editor):

```sql
-- Replace with your test user's auth.users id
select user_id, verification_status, email_verified
from profiles
where verification_status = 'pending_email_verification'
limit 5;
```

Then open in the browser (token from `email_verification_tokens` is hashed in DB — easier to use the real email link). To force state without email:

```sql
update profiles
set
  email_verified = true,
  email_verified_at = now(),
  verification_status = 'pending_admin_review'
where user_id = 'YOUR_USER_ID';
```

Refresh `/verify-email` → redirects to `/pending`.

### Admin approval on localhost

1. Log in as an admin account.
2. Open `/admin` → Users → **Pending** → approve the test user (or use 3 vouches from verified members).
3. User receives **You've Been Approved for EOD-HUB** via Resend (watch terminal for `[auth:approve-user]`).
4. User should reach `/` on next login.

Apply `supabase/migrations/20260520120000_profiles_approval_email.sql` for `admin_approved_at` and `approval_email_sent_at` (idempotent approval email).

**Re-send approval email for an already-approved test user:** approve again in Admin — email sends only if `approval_email_sent_at` is null.

### Google OAuth shortcut

Google onboarding sets `email_verified = true` and goes straight to `/pending` (no Resend step). Use this to test admin queue only.

### Troubleshooting

| Issue | Fix |
|-------|-----|
| No verification email | Check terminal for `send-verification-email: Resend error`; confirm `RESEND_API_KEY` and `RESEND_FROM_EMAIL` domain in Resend dashboard. |
| Link opens production | Restart dev server; ensure you completed onboarding on `localhost:3000`, not eod-hub.com. |
| Stuck after click | Confirm migration ran; check `profiles.verification_status` is `pending_admin_review`. |
| Login shows generic pending message | Expected until fully verified; use `/verify-email` or `/pending` while logged in via onboarding session. |
| `email_verification_tokens` errors | Migration not applied — run `20260519120000_email_verification.sql`. |
| No approval email after admin verify | Check `[auth:approve-user]` logs; confirm `RESEND_API_KEY`. Admin toast shows `resend_error` if send failed. |
| Duplicate approval emails | Should not happen — `approval_email_sent_at` blocks re-send. |
