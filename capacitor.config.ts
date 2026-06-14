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
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
    scrollEnabled: true,
    webContentsDebuggingEnabled: true,
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
