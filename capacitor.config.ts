import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.eod-hub.com";

const config: CapacitorConfig = {
  appId: "com.eodhub.app",
  appName: "EOD-Hub",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
