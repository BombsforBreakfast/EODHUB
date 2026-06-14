/**
 * Writes server.url into capacitor.config.ts for CI (Codemagic).
 * Usage: CAPACITOR_SERVER_URL=https://eod-hub.com node scripts/patch-capacitor-server-url.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "capacitor.config.ts");
const url = (process.env.CAPACITOR_SERVER_URL || "https://eod-hub.com").trim();

let cfg = readFileSync(configPath, "utf8");
const serverBlock = `server: {
    url: "${url}",
    cleartext: false,
    errorPath: "/",
    allowNavigation: [
      "eod-hub.com",
      "www.eod-hub.com",
      "*.supabase.co",
    ],
  }`;

const patched = cfg.replace(/server:\s*\{[\s\S]*?\n  \},/, `${serverBlock},`);
if (patched === cfg) {
  throw new Error("Could not patch server block in capacitor.config.ts");
}

writeFileSync(configPath, patched);
console.log("Patched capacitor.config.ts server.url ->", url);
