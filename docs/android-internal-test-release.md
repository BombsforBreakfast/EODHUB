# EOD-HUB Android internal testing — October 8, 2026

## Account and app identity

Use the existing personal Google Play account, findyourcruu@gmail.com,
with developer name Find Your CRUU. The owner authorized this account
for EOD-HUB as well as CRUU. Do not use the pending LLC account.

- App name: EOD-HUB
- Android package: com.eodhub.app
- Production server: https://eod-hub.com
- Version name: 1.5 (existing Android value)
- Codemagic workflow: eod-hub-android

## Configuration still required before a signed test build

1. Inspect Codemagic for the existing eodhub_android_keystore reference.
   If absent, obtain authorization to generate a separate EOD-HUB upload
   key, keep a private backup, and upload it to Codemagic. Do not reuse
   CRUU's upload key.
2. Add an Android app with package com.eodhub.app to the Firebase project
   used by EOD-HUB's server-side FIREBASE_SERVICE_ACCOUNT_JSON. Download
   its actual google-services.json; do not use CRUU's file.
3. In Codemagic's eodhub_android environment group, securely store
   FIREBASE_ANDROID_CONFIG_BASE64 (base64 of that file), and set
   EODHUB_FIREBASE_PROJECT_ID to the corresponding Firebase project ID.
   The build checks package and project identity without printing config.
4. Confirm linux_x2 is available under the account's billing plan before
   starting the existing Android workflow.
5. Build this branch using eod-hub-android. Confirm the AAB and APK are
   signed and inspect merged permissions before uploading the AAB.
6. Create EOD-HUB in the authorized personal Play Console account,
   enable Play App Signing, upload to Internal testing, add the owner
   as a tester, and publish the internal release.
7. Install through the Play testing link. Codemagic's authenticated
   artifact URL must not be used as a phone installation link.

Android currently uses browser-based Supabase OAuth and the existing
com.eodhub.app callback. It does not use CRUU's native Google sign-in
client. Verify Google sign-in returns to the app from both a cold launch
and an already-open app before changing OAuth client registrations.

## Device verification

- Google sign-in and email sign-in return to the app.
- Feed, jobs, profile, messaging, and back navigation work.
- Camera, photo selection, file attachments, and sharing work.
- Notification permission, registration, delivery, and notification
  taps work; server Firebase project matches the Android client.
- Member billing follows existing native billing restrictions.
- Account deletion and report/block controls remain accessible.

The iOS workflow and live web application are unchanged by this
preparation. This is an internal testing setup, not a production release.
Full store listing, Data safety, content rating, app access, and personal
account closed-testing requirements remain separate release steps.
