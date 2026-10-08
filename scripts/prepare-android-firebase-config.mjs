/** Restore Firebase config from Codemagic without logging its contents. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAndroidFirebaseConfig } from "./lib/android-firebase-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "android", "app", "google-services.json");
const encoded = process.env.FIREBASE_ANDROID_CONFIG_BASE64?.trim();
if (!encoded && !existsSync(path)) {
  throw new Error("Set FIREBASE_ANDROID_CONFIG_BASE64 in Codemagic's eodhub_android group before building Android.");
}
const content = encoded
  ? Buffer.from(encoded, "base64").toString("utf8")
  : readFileSync(path, "utf8");
validateAndroidFirebaseConfig(content, process.env.EODHUB_FIREBASE_PROJECT_ID?.trim());
if (encoded) writeFileSync(path, content, { mode: 0o600 });
console.log("Android Firebase configuration verified for com.eodhub.app.");
