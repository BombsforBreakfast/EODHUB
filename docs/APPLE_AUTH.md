# Apple Auth (EOD HUB)

EOD-HUB calls this feature **Apple Auth** everywhere in the product UI (Settings, helper text, etc.). The only place Apple's official "Sign in with Apple" branding appears is the Apple login button itself. It runs through Supabase Auth (`provider: "apple"`) using the same PKCE callback as Google (`/auth/callback`).

## How users sign in with Apple Auth

- **New users**: clicking the Apple button on `/login` opens a short **"Continue with Apple"** helper modal, then continues into the normal onboarding/pending flow (same as Google). They receive a normal profile stub.
- **Existing users with the same email as their Apple ID**: can use Apple Auth immediately — they land on their existing account.
- **Existing users with a different email**: should log in using their current account method first (Email/Password or Google Auth), then go to **Settings → Sign-In Methods → Apple Auth** and link Apple for future sign-ins.
- **Apple Private Relay**: if a user signs in with Apple using a private relay address (`@privaterelay.appleid.com`) instead of linking Apple Auth from their existing account, Supabase may create a separate account that looks like a duplicate. The login helper modal warns about this; the fix is to link Apple Auth from the existing account rather than signing in fresh.

## App code (already wired)

- Login / signup: Apple button on `/login` opens the **Continue with Apple** helper modal before OAuth fires (`app/login/page.tsx`)
- OAuth callback: `app/auth/callback/route.ts`
- Account linking: **Settings → Sign-In Methods → Apple Auth** (`app/(master)/profile/page.tsx`), using Supabase `supabase.auth.linkIdentity({ provider: "apple" })` — the same identity-linking utility used for Google Auth
- Shared OAuth helpers: `app/lib/auth/oauthProviders.ts`, `app/lib/auth/oauthSignIn.ts`
- Apple-only OAuth signups skip Resend email verification (same as Google) and go straight to `/pending` after onboarding

## 1. Apple Developer setup

In [Apple Developer](https://developer.apple.com/account):

### App ID (if you have a native iOS app)

1. **Identifiers → App IDs** → your app (e.g. `com.eodhub.app`)
2. Enable **Sign In with Apple**
3. Save

### Services ID (required for web)

1. **Identifiers → Services IDs** → **+**
2. Description: `EOD HUB Web`
3. Identifier: e.g. `com.eodhub.web` (this is the **Client ID** for Supabase)
4. Enable **Sign In with Apple** → **Configure**
5. **Primary App ID**: select your App ID from above
6. **Domains and Subdomains**: `eod-hub.com` (and `localhost` for local testing if Apple allows it in your setup)
7. **Return URLs** (add both):
   - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
   - Find project ref in Supabase Dashboard → Project Settings → General → Reference ID

### Sign In with Apple key

1. **Keys → +**
2. Name: `EOD HUB Apple Auth`
3. Enable **Sign In with Apple** → Configure → select your Primary App ID
4. Download the `.p8` key **once** (you cannot download it again)
5. Note the **Key ID** and your **Team ID** (Membership details)

## 2. Supabase Dashboard

1. **Authentication → Providers → Apple** → Enable
2. **Client IDs**: your Services ID (e.g. `com.eodhub.web`)
   - If you also use native iOS Sign in with Apple later, comma-separate: `com.eodhub.web,com.eodhub.app`
3. **Secret Key**: generate a client secret JWT from your `.p8` key
   - Supabase docs: [Login with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
   - The secret expires every 6 months; rotate before expiry
4. **Authentication → URL Configuration → Redirect URLs** — ensure these are listed:
   - `https://eod-hub.com/auth/callback`
   - `http://localhost:3000/auth/callback` (local dev)

## 3. Generate the Apple client secret (one-time / rotation)

Use Supabase’s documented script or any JWT tool with:

- **iss**: your Apple Team ID  
- **sub**: your Services ID (`com.eodhub.web`)  
- **aud**: `https://appleid.apple.com`  
- **kid**: your Key ID  
- Signed with the `.p8` private key (ES256)

Paste the resulting JWT into Supabase **Apple → Secret Key**.

## 4. Test locally

1. Complete Apple + Supabase configuration above
2. `npm run dev` → [http://localhost:3000/login](http://localhost:3000/login)
3. Click **Sign in with Apple**
4. Complete Apple login → should land on `/onboarding` (new user) or home (existing user)
5. Finish onboarding → should go to `/pending` (no Resend step)

## 5. Production checklist

- [ ] Services ID return URL includes Supabase callback URL
- [ ] Supabase redirect URLs include production `https://eod-hub.com/auth/callback`
- [ ] Apple secret JWT is set and calendar reminder to rotate in ~6 months
- [ ] Test **Settings → Sign-In Methods → Apple Auth** linking on an existing email/password user

## Notes

- Apple may provide a private relay email (`@privaterelay.appleid.com`). That is valid for EOD HUB accounts.
- Business / Organization Google-only flows are unchanged; Apple is for member/employer login only.
- If sign-in fails with `login?error=auth`, check Supabase **Authentication → Logs** and verify callback + secret.
