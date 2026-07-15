# Push notification sound (`eod_click`)

EOD-Hub uses a custom native push alert: a bright water-drop plop (~0.32s) named **`eod_click.wav`**.

## Current implementation

| Layer | Provider | Notes |
|-------|----------|--------|
| **iOS app** | Apple Push Notification service (APNs) | Direct HTTP/2 from Vercel via `app/lib/server/apnsSend.ts` |
| **Android app** | Firebase Cloud Messaging (FCM) HTTP v1 | `app/lib/server/fcmSend.ts` (requires `FIREBASE_SERVICE_ACCOUNT_JSON`) |
| **Client shell** | Capacitor `@capacitor/push-notifications` | Token registration in `app/components/NativeShellBridge.tsx` |
| **Deep links** | Unchanged | Tap handler reads `data.link` → `router.push()` |

Push dispatch: `app/lib/server/pushDispatch.ts` (notifications) and `app/lib/server/pushCampaigns.ts` (admin campaigns).

## Sound file locations

| Platform | Path | Bundled name |
|----------|------|--------------|
| **iOS** | `ios/App/App/eod_click.wav` | Copy Bundle Resources in Xcode |
| **Android** | `android/app/src/main/res/raw/eod_click.wav` | Referenced as `R.raw.eod_click` |

Regenerate both copies:

```bash
npm run generate:notification-sound
```

Source: `scripts/generate-notification-sound.mjs`  
Constants: `app/lib/pushNotificationSound.ts`

## Payload fields when sending

### iOS (APNs)

```json
{
  "aps": {
    "alert": { "title": "…", "body": "…" },
    "sound": "eod_click.wav"
  },
  "link": "/notifications"
}
```

- **`aps.sound`**: `eod_click.wav` (filename **with** extension)
- If the file is missing from an older app build, **iOS automatically falls back** to the default system alert tone.

Env: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_ENV`.

### Android (FCM HTTP v1)

```json
{
  "message": {
    "token": "<device_token>",
    "notification": { "title": "…", "body": "…" },
    "data": { "link": "/notifications" },
    "android": {
      "priority": "HIGH",
      "notification": {
        "channel_id": "eod_hub_alerts",
        "sound": "eod_click"
      }
    }
  }
}
```

- **`android.notification.sound`**: `eod_click` (basename **without** extension; maps to `res/raw/eod_click.wav`)
- **`android.notification.channel_id`**: `eod_hub_alerts` — created in `MainActivity.java` with the same custom sound
- If the raw resource is missing, Android uses the channel/device default tone.

Env: `FIREBASE_SERVICE_ACCOUNT_JSON` (full Firebase service account JSON for the linked Firebase project).

Android also needs `android/app/google-services.json` in the native build (see `docs/android-play-store-setup.md`).

## App states

| State | iOS | Android |
|-------|-----|---------|
| **Foreground** | Capacitor `presentationOptions: ["badge","sound","alert"]` plays alert + sound | FCM notification payload shows in tray with channel sound |
| **Background / killed** | APNs delivers alert; tap → `pushNotificationActionPerformed` → deep link | FCM delivers notification; tap → same Capacitor listener |

Navigation/deep-link behavior is unchanged (`NativeShellBridge.tsx`).

## CI checks

- iOS: `node scripts/verify-capacitor-ios-config.mjs`
- Android: `node scripts/verify-capacitor-android-config.mjs`

Both assert `eod_click.wav` is present after `npm run generate:notification-sound`.
