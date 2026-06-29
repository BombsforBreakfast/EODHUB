import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bombsuitman.game",
  appName: "Bomb Suit Man",
  webDir: "dist",
  android: {
    backgroundColor: "#090612",
  },
  ios: {
    backgroundColor: "#090612",
    contentInset: "automatic",
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#090612",
      showSpinner: false,
    },
  },
};

export default config;
