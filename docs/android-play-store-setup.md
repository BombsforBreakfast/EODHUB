# EOD-Hub Android / Google Play Setup

Manual steps before the first Internal testing build. Code and CI config live in this repo; Google account setup is done in Play Console.

**Billing model:** RevenueCat handles iOS + Android in-app subscriptions. Stripe is web-only for member checkout and business org billing. See [`subscription-architecture.md`](subscription-architecture.md).

## 1. Google Play Developer account

1. Go to [Google Play Console](https://play.google.com/console/signup) and enroll ($25 one-time).
2. Use the same legal entity name you want on the Play Store listing.
3. Complete identity verification and developer profile.

## 2. Play Console app record

1. Open Play Console → **Create app**.
2. Use these values (must match repo config):

| Field | Value |
|-------|-------|
| App name | EOD-Hub |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free (subscriptions via IAP) |
| Package name | `com.eodhub.app` — **cannot change after creation** |

3. Set **Privacy policy URL** to `https://www.eod-hub.com/privacy`
4. Set **Support URL / email** to `https://www.eod-hub.com/support` / `Hello@eod-hub.com`

## 3. Native shell architecture

Same as iOS: a **thin Capacitor shell** loads the live production site (`https://eod-hub.com`). The app is not a bundled static export.

| | Play Store app | Chrome “Add to Home screen” |
|--|--|--|
| Opens in | In-app WebView | Chrome |
| Sign-in session | Separate from browser cookies | Same as Chrome |
| OAuth return | `com.eodhub.app://auth/callback` | Stays in browser |

**Critical:** `server.url` must be the canonical apex domain (`https://eod-hub.com`), not `www`.

### OAuth deep link

**Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs** — ensure these exist (shared with iOS):

```
com.eodhub.app://auth/callback
https://eod-hub.com/auth/app-callback
https://eod-hub.com/auth/callback
```

Android intent filter is in [`android/app/src/main/AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml).

## 4. RevenueCat + Play Billing (when paywall ships)

1. Create a [RevenueCat](https://www.revenuecat.com/) project (one project for iOS + Android).
2. **Entitlement:** `member_access` → maps to DB key `eodhub_member`.
3. **Play Console** → **Monetize** → **Subscriptions** → create monthly product.
4. Link Play app + App Store app in RevenueCat.
5. **Webhook URL:** `https://eod-hub.com/api/billing/revenuecat`
6. **Authorization header:** `Bearer <REVENUECAT_WEBHOOK_SECRET>` (set in Vercel env).

Vercel environment variables:

```
REVENUECAT_WEBHOOK_SECRET=<generate a long random secret>
```

Native apps will also need (when SDK is integrated):

```
NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY=<from RevenueCat>
NEXT_PUBLIC_REVENUECAT_IOS_API_KEY=<from RevenueCat>
```

**Do not** embed Stripe Checkout in the Capacitor WebView. Web uses Stripe; native uses RevenueCat.

## 5. Push notifications (optional for v1)

Android push requires Firebase:

1. Create a Firebase project linked to `com.eodhub.app`.
2. Download `google-services.json` → `android/app/google-services.json`.
3. Add FCM server-side sender (iOS APNs already works; Android dispatch is not wired yet).

Codemagic/Android Gradle auto-applies the Google Services plugin when `google-services.json` is present.

## 6. Codemagic signing

1. Create a [Codemagic](https://codemagic.io/) account and connect this GitHub repo.
2. Enable **codemagic.yaml** as the project configuration.

### 6a. Upload keystore

In Codemagic → **Teams** → **Code signing identities** → **Android keystores**:

1. Generate an upload keystore (or use Android Studio → Build → Generate Signed Bundle).
2. Upload as **`eodhub_android_keystore`** — must match [`codemagic.yaml`](../codemagic.yaml):

```yaml
android_signing:
  - eodhub_android_keystore
```

3. Note the keystore password, key alias, and key password in Codemagic secure variables.

**Keep the keystore safe.** Losing it blocks future updates unless you reset Play App Signing with Google support.

### 6b. Play App Signing

On first `.aab` upload, enroll in **Play App Signing** (recommended). Google holds the app signing key; you keep the upload key.

## 7. Store listing assets

Required before production:

| Asset | Spec |
|-------|------|
| App icon | 512×512 PNG |
| Feature graphic | 1024×500 PNG |
| Phone screenshots | Min 2 (1080×1920 or 1440×2560) |
| Short description | 80 characters max |
| Full description | Up to 4000 characters |

Replace default Capacitor launcher icons in `android/app/src/main/res/mipmap-*` using `ios-assets/app-icon-1024.png` as source (Android Studio Image Asset Studio works well).

## 8. Compliance checklist

Mirror [`ios-app-store-compliance.md`](ios-app-store-compliance.md):

- [ ] **Data safety** form completed (email, name, user content, push token, analytics)
- [ ] **Content rating** questionnaire completed
- [ ] **Target audience** declared
- [ ] Privacy policy live at `https://www.eod-hub.com/privacy`
- [ ] No Stripe checkout inside native WebView
- [ ] Restore Purchases UI when RevenueCat is live (required for store review)

## 9. First build

1. Complete keystore upload (section 6)
2. Push to `main` or start workflow **EOD-Hub Android Internal** in Codemagic
3. Download the `.aab` artifact
4. Play Console → **Testing** → **Internal testing** → create release → upload `.aab`
5. Add testers, install from Play Store test link

Verify on a physical device:

- App loads feed without browser chrome
- Google/Apple sign-in returns to app via deep link
- Core navigation works (feed, jobs, messages)

## 10. Demo account for review

Create a reviewer-safe account and add credentials in Play Console → **App content** → **App access**:

- Email / password for a member with feed, messaging, and notifications
- Note that the app loads `https://eod-hub.com` and requires internet

## Local development (optional)

```bash
npm run cap:sync:android
npm run cap:open:android
```

Requires Android Studio. The WebView loads production unless you set `CAPACITOR_SERVER_URL` before sync.
