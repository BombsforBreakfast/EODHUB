# App icon notification badges

EOD-Hub shows the active unread notification count as a number on the native
iOS and Android app icon.

## Behavior

- A push received while the app is backgrounded or closed carries the current
  unread count.
- Opening/resuming the app synchronizes the badge with the `notifications`
  table.
- Opening, dismissing, or marking notifications read updates the badge.
- Signing out clears the badge.
- Counts persist across app restarts (`Badge.persist: true`) and do not clear
  merely because the app was opened (`Badge.autoClear: false`).

## Native implementation

- Plugin: `@capawesome/capacitor-badge` 7.x (Capacitor 7 compatible)
- Client synchronization: `app/lib/native/appIconBadge.ts`
- Native lifecycle integration: `app/components/NativeShellBridge.tsx`
- In-app unread updates: `app/components/NavBar.tsx`

The iOS privacy manifest already declares the required UserDefaults reason
`CA92.1`.

## Push payload fields

APNs:

```json
{
  "aps": {
    "badge": 4
  }
}
```

FCM HTTP v1:

```json
{
  "message": {
    "android": {
      "notification": {
        "notification_count": 4
      }
    }
  }
}
```

`app/lib/server/unreadNotificationCount.ts` calculates the authoritative count.

## Android limitation

Android launcher badges are manufacturer/launcher dependent. Supported
launchers show the numeric badge; unsupported launchers may show only a
notification dot or no badge. The EOD-Hub notification channel explicitly
allows badges.

## Release requirement

This feature adds a Capacitor native plugin and therefore requires new iOS and
Android native builds. A Vercel-only deployment updates payloads but cannot add
the native plugin to an already-installed app.
