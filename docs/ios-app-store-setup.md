# EOD-Hub iOS App Store Setup

Manual steps required before the first TestFlight build. Code and CI config live in this repo; Apple account setup is done in Apple's portals.

## 1. Apple Developer Program

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs/) and enroll ($99/year).
2. Use the same legal name you want on the App Store listing.
3. If enrolling as an organization, obtain a D-U-N-S number first.

## 2. App Store Connect app record

1. Open [App Store Connect](https://appstoreconnect.apple.com/) → **Apps** → **+** → **New App**.
2. Use these values (must match repo config):

| Field | Value |
|-------|-------|
| Platform | iOS |
| Name | EOD-Hub |
| Primary language | English (U.S.) |
| Bundle ID | `com.eodhub.app` |
| SKU | `eodhub-ios-001` (any unique string) |

3. Set **Support URL** to `https://www.eod-hub.com/support`
4. Set **Privacy Policy URL** to `https://www.eod-hub.com/privacy`
5. Set **Marketing URL** (optional) to `https://www.eod-hub.com`

## 3. APNs key (push notifications)

1. [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) → **Keys** → **+**
2. Name: `EOD-Hub APNs`
3. Enable **Apple Push Notifications service (APNs)**
4. Download the `.p8` file once (cannot re-download).
5. Note the **Key ID** and your **Team ID** (Membership details page).

Add to Vercel environment variables:

```
APNS_KEY_ID=<10-char key id>
APNS_TEAM_ID=<10-char team id>
APNS_BUNDLE_ID=com.eodhub.app
APNS_PRIVATE_KEY=<contents of .p8 file, newlines as \n>
APNS_ENV=production
```

For TestFlight/sandbox testing, set `APNS_ENV=sandbox` on preview deployments.

## 4. Codemagic signing and App Store Connect integration

1. Create a [Codemagic](https://codemagic.io/) account and connect this GitHub repo.
2. Enable **codemagic.yaml** as the project configuration (not the UI workflow editor).

### 4a. App Store Connect API key (Apple)

1. [App Store Connect](https://appstoreconnect.apple.com) → **Users and Access** → **Integrations** → **App Store Connect API**
2. **+** to generate a key (role **App Manager** or **Admin** is fine for TestFlight upload)
3. Download the `.p8` file once (cannot re-download)
4. Note the **Issuer ID** (top of Keys page) and **Key ID** (on the key row)

### 4b. Apple Developer Portal integration (Codemagic)

1. Codemagic → **Teams** → **Team integrations** (or **Personal account** → **Integrations**)
2. **Apple Developer Portal** → add integration
3. Paste Issuer ID, Key ID, and `.p8` contents
4. Name the integration **`eodhub-asc`** — must match [`codemagic.yaml`](../codemagic.yaml):

```yaml
integrations:
  app_store_connect: eodhub-asc
```

If you use a different name in the UI, update `codemagic.yaml` to match exactly.

### 4c. iOS code signing (Codemagic)

In **Teams** → **Code signing identities**:

- Upload or auto-generate an **iOS Distribution Certificate**
- Create an **App Store provisioning profile** for `com.eodhub.app` with **Push Notifications** enabled

The workflow uses:

```yaml
environment:
  ios_signing:
    distribution_type: app_store
    bundle_identifier: com.eodhub.app
```

### 4d. Validate yaml

After pushing to `main`, open the app in Codemagic → **codemagic.yaml** tab. The red **Invalid yaml configuration** error should clear once `eodhub-asc` exists in Team integrations.

**TestFlight beta group:** [`codemagic.yaml`](../codemagic.yaml) uses `Internal Testers`. That string must match a group name in App Store Connect → TestFlight → Internal Testing exactly (including capitalization).

## 5. First build

1. Complete sections 4a–4c above (API key, `eodhub-asc` integration, signing cert + profile)
2. Push to `main` or click **Start new build** → workflow **EOD-Hub iOS TestFlight**

Codemagic will:

1. `npm ci`
2. `npx cap sync ios`
3. Archive and upload to TestFlight

Install via TestFlight on a physical iPhone (push does not work in Simulator).

## 5a. Native app vs Safari home-screen icon

The TestFlight app and a Safari **Add to Home Screen** shortcut can look similar but behave differently:

| | TestFlight / App Store app | Safari home-screen shortcut |
|--|--|--|
| Opens in | In-app WebView (no address bar) | Safari (or standalone Safari tab) |
| Sign-in session | Separate from Safari cookies | Same as Safari |
| OAuth return | `com.eodhub.app://` deep link back to the app | Stays in Safari |

If tapping the icon opens Safari with a URL bar, you are likely using the **web shortcut**, not the TestFlight build. Install from the **TestFlight** app → **EOD-Hub** → **Install**, then open **EOD-Hub** from the home screen (not a bookmark).

### Why the native shell uses a remote URL (not a bundled static export)

EOD-HUB is a full Next.js App Router app on Vercel (SSR, API routes, Supabase cookie auth). It cannot be statically exported into Capacitor's `webDir` without a major rewrite. The intentional architecture is a **thin Capacitor shell** whose WebView loads the live production site.

**Critical:** `server.url` must be the **canonical** origin (`https://eod-hub.com`). If it points at `https://www.eod-hub.com`, Vercel 307-redirects to the apex domain. Capacitor iOS treats that redirect as an external navigation and opens **Safari**, leaving a blank WebView (black screen).

### OAuth / black screen after sign-in

Google and Apple sign-in open a **system browser sheet** briefly (looks like Safari). The app must receive the callback via custom URL scheme `com.eodhub.app://auth/callback`.

**Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs** — add:

```
com.eodhub.app://auth/callback
```

Keep the existing `https://eod-hub.com/auth/callback` (and `https://www.eod-hub.com/auth/callback`) entries for web.

After changing native OAuth wiring or `Info.plist` URL schemes, ship a **new TestFlight build** (Codemagic on `main`). Web-side auth fixes deploy with the normal Vercel production deploy.

## 6. Demo account for App Review

Create a reviewer-safe account and add credentials in App Store Connect → **App Review Information**:

- Email / password for a member account with feed, messaging, and notifications enabled
- Note that the app loads `https://eod-hub.com` and requires internet
