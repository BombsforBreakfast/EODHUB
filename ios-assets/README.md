# iOS app assets

Place a **1024×1024** PNG app icon here as `app-icon-1024.png`.

Regenerate branded native splash screens (iOS + Android) from the EOD HUB wordmark:

```bash
npm run generate:splash
```

On the first Codemagic/Xcode build:

1. Open `ios/App/App/Assets.xcassets/AppIcon.appiconset`
2. Import `app-icon-1024.png` for the App Store icon slot
3. Enable **Push Notifications** capability on the App target
