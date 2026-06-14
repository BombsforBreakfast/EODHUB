/**
 * Fails CI if the synced iOS Capacitor config is missing the production server URL.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = join(root, "ios", "App", "App", "capacitor.config.json");
const expected = (process.env.CAPACITOR_SERVER_URL || "https://eod-hub.com").trim();

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

console.log("OK: iOS capacitor.config.json server.url =", actual);
