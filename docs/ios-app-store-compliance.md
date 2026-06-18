# EOD-Hub iOS App Store Compliance

Use this checklist before submitting for App Review.

## Privacy Manifest (native app bundle)

The iOS target ships [`ios/App/App/PrivacyInfo.xcprivacy`](../ios/App/App/PrivacyInfo.xcprivacy) in the app bundle:

- **Tracking:** `NSPrivacyTracking` = false (no IDFA / cross-app tracking in the native shell)
- **Required Reason APIs:** `UserDefaults` with reason `CA92.1` (Capacitor plugin / app preferences)

Capacitor CocoaPods merge their own SDK manifests at archive time. After a Codemagic or Xcode archive, use **Organizer → Generate Privacy Report** and add any additional required-reason API categories Apple flags (e.g. file timestamps `C617.1`).

[`Info.plist`](../ios/App/App/Info.plist) declares `ITSAppUsesNonExemptEncryption` = false (HTTPS only; exempt mass-market encryption).

**Camera / photo library:** `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and `NSMicrophoneUsageDescription` are required for feed and profile photo/video uploads via the system picker (“Take Photo” crashes without them). Changes require a **new TestFlight build** — they are not applied by a Vercel deploy alone.

## Payments (Guideline 3.1.1)

Membership pricing is **TBD**; paywall is suspended during beta. The app is free for TestFlight / initial listing.

When paid features ship in-app, Apple may require In-App Purchase for digital goods initiated inside the app. Future arcade consumables will use StoreKit / RevenueCat; business advertising billing remains web-first.

**Do not** embed Stripe Checkout inside the Capacitor WebView.

## Privacy Nutrition Labels (App Store Connect)

**Manual step:** In App Store Connect → App Privacy, enter the table below. It must match the privacy manifest (no tracking) and your live privacy policy.

Declare data collected by the app (loaded from `https://www.eod-hub.com`):

| Data type | Collected | Linked to user | Used for |
|-----------|-----------|----------------|----------|
| Email address | Yes | Yes | Account, support |
| Name | Yes | Yes | Profile |
| User ID | Yes | Yes | Account |
| Photos / videos | Optional | Yes | Profile, posts |
| Other user content | Yes | Yes | Feed, messages |
| Product interaction | Yes | Yes | Analytics (Vercel Analytics) |
| Device ID | Yes (push token) | Yes | Push notifications |

**Not used:** cross-app tracking, advertising, precise location.

**Connect checklist:**

- [ ] Data types above entered in App Privacy questionnaire
- [ ] Tracking = No
- [ ] Privacy Policy URL = `https://www.eod-hub.com/privacy`
- [ ] Matches `PrivacyInfo.xcprivacy` (no tracking declared natively)

## Privacy policy and support

- Privacy: `https://www.eod-hub.com/privacy` (live)
- Support: `https://www.eod-hub.com/support` (live)
- Contact: `Hello@eod-hub.com`

## Screenshots and metadata

Required before submission:

- **App icon:** 1024×1024 PNG (no transparency). Place source in `ios-assets/app-icon-1024.png` and copy into Xcode asset catalog on first Mac build.
- **Screenshots:** 6.7" (iPhone 15 Pro Max) and 6.5" — capture feed, jobs, messages, notifications settings.
- **Description:** Emphasize EOD professional community, job board, messaging, groups.
- **Keywords:** EOD, explosive ordnance disposal, job board, military, bomb technician
- **Age rating:** 17+ (user-generated content, professional community)

## App Review demo account

Provide in App Review Information:

```
Email: <reviewer@example.com>
Password: <secure password>
```

Ensure the account can: log in, view feed, open Sidebars (DMs), receive a test push (optional), and view notification settings at `/account/notifications`.

## Push notification permission copy

The system permission dialog is standard iOS text. In-app, users can disable push at **Account → Notification settings → Push notifications**.

## Export compliance

[`Info.plist`](../ios/App/App/Info.plist) sets `ITSAppUsesNonExemptEncryption` = false.

In App Store Connect export compliance questions: answer **No** to proprietary encryption (standard HTTPS only; exempt mass-market encryption).

## Codemagic / TestFlight verification

After pushing to `main`, Codemagic runs [`codemagic.yaml`](../codemagic.yaml) and uploads to TestFlight.

Post-build (Xcode Organizer on archive, or App Store Connect upload logs):

1. Confirm build succeeds with `PrivacyInfo.xcprivacy` in the app bundle
2. **Generate Privacy Report** on the archive — verify merged Capacitor SDK + app manifests
3. Add any missing required-reason API declarations to `PrivacyInfo.xcprivacy` if Apple flags them
