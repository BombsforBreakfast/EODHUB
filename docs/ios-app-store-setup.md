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

## 4. Codemagic signing

1. Create a [Codemagic](https://codemagic.io/) account and connect this GitHub repo.
2. In Codemagic → **Teams** → **Code signing identities**:
   - Upload or auto-generate **iOS Distribution Certificate**
   - Create **App Store provisioning profile** for `com.eodhub.app` with Push Notifications enabled
3. Add App Store Connect API key for upload:
   - App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → generate key
   - Add to Codemagic as `APP_STORE_CONNECT_*` variables (see `codemagic.yaml` comments)

## 5. First build

Push to the branch configured in `codemagic.yaml`. Codemagic will:

1. `npm ci`
2. `npx cap sync ios`
3. Archive and upload to TestFlight

Install via TestFlight on a physical iPhone (push does not work in Simulator).

## 6. Demo account for App Review

Create a reviewer-safe account and add credentials in App Store Connect → **App Review Information**:

- Email / password for a member account with feed, messaging, and notifications enabled
- Note that the app loads `https://www.eod-hub.com` and requires internet
