/**
 * Fails CI if the synced iOS Capacitor config is missing the production server URL.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "ios", "App", "App", "capacitor.config.json");
const expected = (process.env.CAPACITOR_SERVER_URL || "https://eod-hub.com").trim();
const podfilePath = join(root, "ios", "App", "Podfile");
const appDelegatePath = join(root, "ios", "App", "App", "AppDelegate.swift");
const storyboardPath = join(root, "ios", "App", "App", "Base.lproj", "Main.storyboard");

if (!existsSync(jsonPath)) {
  console.error("Missing", jsonPath, "— run npx cap sync ios first");
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(jsonPath, "utf8"));
const actual = cfg?.server?.url;

if (actual !== expected) {
  console.error(`capacitor.config.json server.url mismatch: expected ${expected}, got ${actual ?? "(none)"}`);
  process.exit(1);
}

const requiredNativeFiles = [podfilePath, appDelegatePath, storyboardPath];
for (const path of requiredNativeFiles) {
  if (!existsSync(path)) {
    console.error("Missing native iOS file", path);
    process.exit(1);
  }
}

const podfile = readFileSync(podfilePath, "utf8");
const appDelegate = readFileSync(appDelegatePath, "utf8");
const storyboard = readFileSync(storyboardPath, "utf8");

if (!podfile.includes("pod 'Mux-Upload-SDK', '1.1.1'")) {
  console.error("Podfile is missing the pinned Mux Upload SDK.");
  process.exit(1);
}
if (!appDelegate.includes("class MuxVideoUploadPlugin") || !appDelegate.includes("registerPluginInstance(MuxVideoUploadPlugin())")) {
  console.error("AppDelegate.swift is missing the native Mux Capacitor bridge.");
  process.exit(1);
}
if (!storyboard.includes('customClass="MainViewController"')) {
  console.error("Main.storyboard is not using the native plugin-registering view controller.");
  process.exit(1);
}

const notificationSoundPath = join(root, "ios", "App", "App", "eod_click.wav");
if (!existsSync(notificationSoundPath)) {
  console.error("Missing bundled push notification sound", notificationSoundPath, "— run npm run generate:notification-sound");
  process.exit(1);
}

console.log("OK: iOS capacitor.config.json server.url =", actual);
console.log("OK: iOS native Mux video upload bridge is configured");
console.log("OK: iOS push notification sound is bundled");
