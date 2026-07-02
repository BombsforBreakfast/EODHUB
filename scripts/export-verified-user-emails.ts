/**
 * Export verified member emails to CSV (excludes waitlist signups and onboarding users).
 *
 * Usage: npx tsx scripts/export-verified-user-emails.ts
 * Output: exports/verified-user-emails.csv
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
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

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
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

  const waitlistRows = await fetchAll<{ email: string }>((from, to) =>
    admin.from("waitlist_signups").select("email").order("email", { ascending: true }).range(from, to),
  );
  const waitlistEmails = new Set(
    waitlistRows.map((row) => row.email.trim().toLowerCase()).filter(Boolean),
  );

  const profiles = await fetchAll<{
    email: string | null;
    must_complete_onboarding: boolean | null;
    account_deleted_at: string | null;
  }>((from, to) =>
    admin
      .from("profiles")
      .select("email, must_complete_onboarding, account_deleted_at")
      .eq("verification_status", VERIFICATION.VERIFIED)
      .order("email", { ascending: true })
      .range(from, to),
  );

  const emails: string[] = [];
  let skippedOnboarding = 0;
  let skippedWaitlist = 0;
  let skippedDeleted = 0;
  let skippedMissingEmail = 0;

  for (const profile of profiles) {
    if (profile.account_deleted_at) {
      skippedDeleted += 1;
      continue;
    }
    if (profile.must_complete_onboarding) {
      skippedOnboarding += 1;
      continue;
    }
    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      skippedMissingEmail += 1;
      continue;
    }
    if (waitlistEmails.has(email)) {
      skippedWaitlist += 1;
      continue;
    }
    emails.push(email);
  }

  const uniqueEmails = [...new Set(emails)].sort((a, b) => a.localeCompare(b));

  const outDir = resolve(root, "exports");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "verified-user-emails.csv");
  const csv = ["email", ...uniqueEmails.map(escapeCsvField)].join("\n");
  writeFileSync(outPath, csv, "utf8");

  console.log(`Verified profiles queried: ${profiles.length}`);
  console.log(`Skipped (onboarding): ${skippedOnboarding}`);
  console.log(`Skipped (waitlist): ${skippedWaitlist}`);
  console.log(`Skipped (deleted): ${skippedDeleted}`);
  console.log(`Skipped (missing email): ${skippedMissingEmail}`);
  console.log(`Exported emails: ${uniqueEmails.length}`);
  console.log(`Wrote ${outPath}`);
}

void main();
