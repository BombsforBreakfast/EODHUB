/**
 * Seed 3-day inactive-member email batches (200 / 200 / remaining) into Supabase.
 *
 * Usage: npx tsx scripts/seed-inactive-member-email-batches.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY,
  splitRecipientsIntoBatches,
} from "../app/lib/server/inactiveMemberUpdateEmailCampaign";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BATCH_SIZES = [200, 200, 97];

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

function addUtcDays(base: Date, days: number): string {
  const copy = new Date(base);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function readPendingRecipients(): string[] {
  const pendingPath = resolve(root, "exports/inactive-member-update-pending.csv");
  const text = readFileSync(pendingPath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line.toLowerCase() !== "email");
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey);
  const recipients = readPendingRecipients();
  const batches = splitRecipientsIntoBatches(recipients, BATCH_SIZES);
  const start = new Date();

  const rows = batches.map((batchRecipients, index) => ({
    campaign_key: INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY,
    batch_number: index + 1,
    scheduled_for: addUtcDays(start, index + 1),
    recipients: batchRecipients,
  }));

  const { error: deleteError } = await admin
    .from("email_campaign_batches")
    .delete()
    .eq("campaign_key", INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY);
  if (deleteError) {
    console.error("Failed clearing prior campaign rows:", deleteError.message);
    process.exit(1);
  }

  const { error: insertError } = await admin.from("email_campaign_batches").insert(rows);
  if (insertError) {
    console.error("Failed inserting campaign batches:", insertError.message);
    process.exit(1);
  }

  console.log(`Campaign: ${INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY}`);
  for (const row of rows) {
    console.log(
      `- Batch ${row.batch_number}: ${row.recipients.length} recipients on ${row.scheduled_for}`,
    );
  }
  console.log(`Total pending recipients seeded: ${rows.reduce((sum, row) => sum + row.recipients.length, 0)}`);
}

void main();
