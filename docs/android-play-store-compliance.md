# EOD-Hub Android / Google Play Compliance

Use this checklist before uploading the first Internal testing `.aab` and again before production. Mirror of [`ios-app-store-compliance.md`](ios-app-store-compliance.md) with Play-specific nuances.

## Play vs Apple (what bites this app)

| Topic | Apple | Google Play nuance for EOD Hub |
|-------|-------|--------------------------------|
| Privacy disclosure | App Privacy “nutrition labels” | **Data safety** form is stricter: encryption in transit, data deletion, sharing with third parties (Supabase, Vercel Analytics, FCM), and whether data is required vs optional |
| Ads / Advertising ID | Tracking = No in privacy manifest | Declare **no advertising ID**; remove merged `AD_ID` in the Android manifest |
| Permissions | Usage description strings | After `cap sync`, Camera / Filesystem / Push plugins merge permissions — Play may require a **Permissions declaration**; prefer Photo Picker / scoped access, avoid broad storage |
| Thin WebView shell | Accepted for TestFlight | Play is harsher on “website wrapper” apps — listing + review notes must emphasize **native value** |
| UGC | Age 17+ + review notes | Explicit **User-generated content** declaration + in-app report/block |
| Account deletion | App Store requirement | Play also requires **in-app account deletion** |
| Testing gate | TestFlight internal | New Play accounts often need **Closed testing** before production — plan Internal → Closed → Production |
| Signing | ASC certs | **Play App Signing** + upload keystore (`eodhub_android_keystore`); never lose the upload key |
| Build numbers | Codemagic `agvtool` on iOS | Android `versionCode` must **monotonically increase** every Play upload — CI bumps from `$BUILD_NUMBER` |
| Push | APNs wired | **FCM** needs `android/app/google-services.json` (do **not** commit a placeholder; add as a Codemagic secret / file before Android push) |
| Payments | StoreKit / no Stripe in WebView | Same rule: **no Stripe Checkout in WebView**; when paid, use Play Billing via RevenueCat |

Repo setup: [`docs/android-play-store-setup.md`](android-play-store-setup.md). CI: [`codemagic.yaml`](../codemagic.yaml) (`eod-hub-android` → `bundleRelease`). Manifest today is minimal ([`AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml) — `INTERNET` only); Camera / Push sync will expand it.

## Data safety form (Play Console)

**Manual step:** Play Console → **App content** → **Data safety**. Map from the iOS privacy table and your live policy.

| Data type | Collected | Required / optional | Linked to user | Shared with third parties | Purpose |
|-----------|-----------|---------------------|----------------|---------------------------|---------|
| Email address | Yes | Required for account | Yes | Supabase (auth/storage) | Account management |
| Name | Yes | Required for profile | Yes | Supabase | Account / app functionality |
| User ID | Yes | Required | Yes | Supabase | Account / app functionality |
| Photos and videos | Yes | Optional (user uploads) | Yes | Supabase Storage | App functionality |
| Other user-generated content | Yes | Optional (posts, comments, DMs, Team Room) | Yes | Supabase | App functionality |
| App activity / product interaction | Yes | Analytics | Yes | Vercel Analytics | Analytics |
| Device or other IDs | Yes (push token, when FCM is enabled) | Optional until user grants push | Yes | FCM / push provider | App functionality (notifications) |

**Answers reviewers expect:**

- Encryption in transit: **Yes** (HTTPS to `eod-hub.com` / Supabase)
- Users can request deletion: **Yes** — Settings / Profile → **Close account** ([`DeleteAccountSection`](../app/components/account/DeleteAccountSection.tsx) → `/api/account/delete`)
- Data is encrypted at rest: follow your Supabase / infra posture; answer consistently with the privacy policy
- Independent security review: No (unless you have one)
- **Advertising ID / Advertising or marketing:** **No** — app does not use ads; AD_ID is removed in the Android manifest

**Third parties to disclose:** Supabase (auth, DB, storage), Vercel Analytics, Firebase Cloud Messaging (only after `google-services.json` is wired).

## Advertising ID

- Play Console Data safety / advertising: declare **no advertising ID**
- Manifest removes merged `AD_ID` via `tools:node="remove"` in [`AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml)
- Do **not** add ads SDKs or Families program opt-in

## Permissions after `cap sync`

Committed manifest is minimal (`INTERNET` only). After `npx cap sync android`, Camera / Filesystem / Push plugins may merge permissions.

Play nuances:

- Prefer **Photo Picker / scoped media**; avoid broad storage (`MANAGE_EXTERNAL_STORAGE`, legacy wide `READ_EXTERNAL_STORAGE`) unless truly required
- Complete Play **Permissions declaration** forms for Camera / Notifications with accurate in-app justifications
- Do not add unused sensitive permissions “just in case”

## Thin WebView shell (Play is stricter than Apple)

Play rejects “website wrapper” apps more often than TestFlight reviewers.

**Listing + review notes must emphasize native value:**

- OAuth custom-scheme deep links (`com.eodhub.app://auth/callback`)
- Push (once FCM / `google-services.json` is wired)
- Native share / action sheet / camera / filesystem plugins
- Offline-capable shell loading the live **canonical** origin `https://eod-hub.com` (not `www`, to avoid redirect-out-of-WebView)

Suggested Play review notes:

> EOD Hub is a Capacitor native shell around the live EOD Hub web app. The shell provides native OAuth deep linking, push notification registration, media capture, and share integrations. The WebView loads the canonical production origin only; it is not a generic browser wrapper.

## Account deletion (Play requirement)

Apps that create accounts must offer **in-app account deletion**.

Reviewer path:

1. Sign in → Profile / Settings
2. **Close account** ([`DeleteAccountSection`](../app/components/account/DeleteAccountSection.tsx))
3. Confirms via `/api/account/delete`

Declare under Data safety (“Users can request that data be deleted”) and mention in review notes.

## User-generated content (UGC)

Play requires an explicit **User-generated content** declaration for feed, comments, DMs, groups, and Team Room.

Reviewers must be able to exercise:

- **Report / flag:** post and comment report flows (including `unit_post_comment`)
- **Hide / block:** [`HideBlockUserButton`](../app/components/HideBlockUserButton.tsx) on feed, DMs, Team Room, groups
- Moderation / admin review path for flagged content

Do **not** opt into the **Families** program. Age rating should reflect adult UGC (align with iOS 17+).

## Testing gate before production

Unlike TestFlight, new personal Play developer accounts often must run **Closed testing** (historically ~12 testers / ~14 days) before production.

Progression: **Internal → Closed → Production**.

## Thin WebView shell (Play is stricter than Apple)

Play rejects “website wrapper” apps more often than TestFlight reviewers.

**Listing + review notes must emphasize native value:**

- OAuth custom-scheme deep links (`com.eodhub.app://auth/callback`)
- Push (once FCM / `google-services.json` is wired)
- Native share / action sheet / camera / filesystem plugins
- Offline-capable shell loading the live **canonical** origin `https://eod-hub.com` (not `www`, to avoid redirect-out-of-WebView)

Suggested Play review notes:

> EOD Hub is a Capacitor native shell around the live EOD Hub web app. The shell provides native OAuth deep linking, push notification registration, media capture, and share integrations. The WebView loads the canonical production origin only; it is not a generic browser wrapper.

## Advertising ID

- Data safety / advertising: declare **no advertising ID**
- Manifest removes merged `AD_ID` via `tools:node="remove"` in [`AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml)
- Do **not** add ads SDKs or Families program opt-in

## Permissions after `cap sync`

Committed manifest is minimal (`INTERNET` only). After `npx cap sync android`, Camera / Filesystem / Push plugins may merge permissions.

Play nuances:

- Prefer **Photo Picker / scoped media**; avoid broad storage (`MANAGE_EXTERNAL_STORAGE`, legacy wide `READ_EXTERNAL_STORAGE`) unless truly required
- Complete Play **Permissions declaration** forms for Camera / Notifications with accurate in-app justifications
- Do not add unused sensitive permissions “just in case”

## Account deletion (Play requirement)

Apps that create accounts must offer **in-app account deletion**.

Reviewer path:

1. Sign in → Profile / Settings
2. **Close account** ([`DeleteAccountSection`](../app/components/account/DeleteAccountSection.tsx))
3. Confirms via `/api/account/delete`

Declare under Data safety (“Users can request that data be deleted”) and mention in review notes.

## UGC / Families

- Declare **User-generated content** for feed, comments, DMs, groups, Team Room
- Reviewers must exercise **Report / flag** and **Hide / block** ([`HideBlockUserButton`](../app/components/HideBlockUserButton.tsx))
- Do **not** opt into the **Families** program; age rating should reflect adult UGC (align with iOS 17+)

## Testing gate before production

Unlike TestFlight, new personal Play developer accounts often must run **Closed testing** (historically ~12 testers / ~14 days) before production.

Progression: **Internal → Closed → Production**.

## Push / FCM

- APNs is wired for iOS.
- Android push needs `android/app/google-services.json` before FCM works.
- **Do not** commit a placeholder `google-services.json` (secrets stay out of git). Add it as a Codemagic secure file when Android push is ready.

## Payments (Play Billing)

Same rule as Apple: **no Stripe Checkout in the WebView**. When paid, use Play Billing via RevenueCat.

## versionCode

Every Play upload must increase `versionCode` monotonically. Codemagic sets it from `$BUILD_NUMBER` before `bundleRelease` (see [`codemagic.yaml`](../codemagic.yaml)), matching iOS `agvtool` behavior. Keep `versionName` (e.g. `1.2.1`) in [`android/app/build.gradle`](../android/app/build.gradle).

## Suggested Play review notes

> EOD Hub is a Capacitor native shell around the live EOD Hub web app. The shell provides native OAuth deep linking, push notification registration, media capture, and share integrations. The WebView loads the canonical production origin only; it is not a generic browser wrapper.

## Suggested Closed testing → Production notes

Document for reviewers:

1. Sign in with the provided demo account
2. Open feed → open a post → report/flag and hide/block another user
3. Profile / Settings → **Close account** (in-app deletion)
4. Open Team Room via the bottom peek bar (hidden on `/games`)
