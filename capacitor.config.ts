import type { CapacitorConfig } from "@capacitor/cli";

/** Canonical production origin — must match Vercel (no www→apex redirect). */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://eod-hub.com";

const config: CapacitorConfig = {
  appId: "com.eodhub.app",
  appName: "EOD-Hub",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
    /** Local fallback page (www/index.html) when remote load fails. */
    errorPath: "/",
    allowNavigation: [
      "eod-hub.com",
      "www.eod-hub.com",
      "*.supabase.co",
    ],
  },
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
  },
  ios: {
    // The web app already lays itself out with viewport-fit=cover and
    // env(safe-area-inset-*). Letting WKWebView add another automatic inset
    // makes its visible viewport disagree with the CSS viewport on iPhone.
    contentInset: "never",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
    scrollEnabled: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
