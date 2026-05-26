/**
 * One-time backfill: founder welcome Sidebar DM for verified members who haven't received it.
 *
 * Usage: npx tsx scripts/backfill-welcome-sidebar.ts
 * Optional: npx tsx scripts/backfill-welcome-sidebar.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ensureWelcomeSidebarMessage } from "../app/lib/server/ensureWelcomeSidebarMessage";
import {
  getWelcomeSidebarSenderUserId,
  DEFAULT_WELCOME_SIDEBAR_SENDER_USER_ID,
} from "../app/lib/welcomeSidebarMessage";
import { VERIFICATION } from "../app/lib/verificationStatus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn("No .env.local found — using existing process.env");
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.argv.includes("--dry-run");

  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const senderId = getWelcomeSidebarSenderUserId() ?? DEFAULT_WELCOME_SIDEBAR_SENDER_USER_ID;
  const admin = createClient(url, serviceKey);

  const { data: rows, error } = await admin
    .from("profiles")
    .select("user_id, display_name, first_name, last_name, welcome_sidebar_sent_at")
    .eq("email_verified", true)
    .eq("admin_verified", true)
    .eq("verification_status", VERIFICATION.VERIFIED)
    .is("welcome_sidebar_sent_at", null)
    .neq("user_id", senderId)
    .order("user_id", { ascending: true });

  if (error) {
    console.error("Failed to list profiles:", error.message);
    process.exit(1);
  }

  const candidates = rows ?? [];
  console.log(`Found ${candidates.length} candidate profile(s). Sender: ${senderId}`);
  if (dryRun) {
    console.log("--dry-run: no writes");
    for (const row of candidates) {
      const name =
        row.display_name?.trim() ||
        `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
        row.user_id;
      console.log(`  would ensure: ${name} (${row.user_id})`);
    }
    return;
  }

  const counts: Record<string, number> = {};

  for (const row of candidates) {
    const name =
      row.display_name?.trim() ||
      `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() ||
      row.user_id;

    const result = await ensureWelcomeSidebarMessage(admin, row.user_id);
    counts[result.reason] = (counts[result.reason] ?? 0) + 1;

    console.log(
      `[${result.sent ? "SENT" : "SKIP"}] ${name} — ${result.reason}${
        result.error ? ` (${result.error})` : ""
      }`,
    );
  }

  console.log("\nSummary:", counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
