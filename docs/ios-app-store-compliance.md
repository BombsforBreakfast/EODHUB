# EOD-Hub iOS App Store Compliance

Use this checklist before submitting for App Review.

## Payments (Guideline 3.1.1)

EOD-Hub sells a **$2/month community membership** (digital access). Apple may require In-App Purchase for upgrades initiated inside the app.

**v1 strategy implemented in code:**

- The native iOS app opens Stripe checkout in **Safari** (external browser), not an in-app WebView checkout.
- Copy on `/subscribe` states payment is completed on the web.
- Do **not** embed Stripe Checkout inside the Capacitor WebView for new subscriptions.

**App Review notes to include:**

> EOD-Hub is a professional community and job board. The iOS app provides access to the same member account as the website. New subscriptions are completed on our website in Safari; the app does not sell digital goods through an in-app purchase flow.

If Apple rejects for IAP, options are: (a) add StoreKit subscription, (b) remove subscribe CTA from the native app and make it account-management-only, or (c) appeal as a multiplatform service with web account management.

## Privacy Nutrition Labels (App Store Connect)

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

In App Store Connect, for standard HTTPS-only app with no custom encryption beyond Apple's OS: answer **No** to proprietary encryption (uses exempt mass-market encryption).
