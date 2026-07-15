/**
 * Backfill LinkedIn job descriptions by revisiting stored apply URLs.
 *
 * Usage:
 *   npx tsx scripts/backfill-linkedin-descriptions.ts
 *   npx tsx scripts/backfill-linkedin-descriptions.ts --dry-run
 *   npx tsx scripts/backfill-linkedin-descriptions.ts --since=2026-07-14
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { scrapeLinkedInJobDetailPage } from "../app/lib/linkedin/scrapeJobDetail";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const authPath = join(homedir(), ".eod-hub", "linkedin-auth.json");
const MIN_DESCRIPTION_LENGTH = 80;

type LinkedInJobRow = {
  id: string;
  linkedin_job_id: string | null;
  title: string;
  apply_url: string;
  description: string | null;
};

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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
}

function parseSinceArg(argv: string[]): string | null {
  const match = argv.find((arg) => arg.startsWith("--since="));
  return match ? match.slice("--since=".length) : null;
}

function needsDescriptionBackfill(row: LinkedInJobRow): boolean {
  if (row.linkedin_job_id === "9999999999") return false;
  const description = row.description?.trim() ?? "";
  if (!description) return true;
  if (description.length < MIN_DESCRIPTION_LENGTH) return true;
  return description.includes("View full details on LinkedIn.");
}

function randomDelayMs(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function main() {
  loadEnvLocal();

  const dryRun = process.argv.includes("--dry-run");
  const since = parseSinceArg(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  if (!existsSync(authPath)) {
    console.error(`No LinkedIn session at ${authPath}. Run: npm run linkedin:login`);
    process.exit(1);
  }

  const admin = createClient(url, serviceKey);
  let query = admin
    .from("jobs")
    .select("id, linkedin_job_id, title, apply_url, description")
    .eq("source_type", "linkedin")
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gte("created_at", `${since}T00:00:00.000Z`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load LinkedIn jobs:", error.message);
    process.exit(1);
  }

  const candidates = (data ?? []).filter(needsDescriptionBackfill);
  console.log(`Found ${candidates.length} LinkedIn job(s) needing description backfill.`);
  if (candidates.length === 0) return;
  if (dryRun) {
    for (const row of candidates) {
      console.log(`  • ${row.title} (${row.apply_url})`);
    }
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authPath });
  const page = await context.newPage();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const row of candidates) {
      try {
        console.log(`Scraping ${row.title}…`);
        const detail = await scrapeLinkedInJobDetailPage(page, row.apply_url);
        if (detail.description.length < MIN_DESCRIPTION_LENGTH) {
          console.warn(`  Skipped — still no description (${detail.description.length} chars)`);
          skipped += 1;
          continue;
        }

        const payload: Record<string, string> = {
          description: detail.description,
          og_description: detail.description,
        };
        if (detail.title) payload.title = detail.title;
        if (detail.companyName) payload.company_name = detail.companyName;
        if (detail.location) payload.location = detail.location;

        const { error: updateError } = await admin.from("jobs").update(payload).eq("id", row.id);
        if (updateError) {
          console.error(`  Update failed: ${updateError.message}`);
          failed += 1;
          continue;
        }

        console.log(`  Updated (${detail.description.length} chars)`);
        updated += 1;
        await page.waitForTimeout(randomDelayMs(900, 1_800));
      } catch (err) {
        console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
        failed += 1;
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify({ candidates: candidates.length, updated, skipped, failed }, null, 2),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
