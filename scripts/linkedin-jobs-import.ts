/**
 * Local LinkedIn job importer (Playwright + saved session).
 *
 * Usage:
 *   npx tsx scripts/linkedin-jobs-import.ts --login     # one-time LinkedIn login
 *   npx tsx scripts/linkedin-jobs-import.ts --dry-run   # scrape only, no API POST
 *   npx tsx scripts/linkedin-jobs-import.ts --force     # bypass 4:30–8 AM window + daily cap
 *   npx tsx scripts/linkedin-jobs-import.ts             # normal run (guarded)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium, type BrowserContext, type Page } from "playwright";
import {
  LINKEDIN_IMPORT_WINDOW_END_MINUTES,
  LINKEDIN_IMPORT_WINDOW_START_MINUTES,
  LINKEDIN_JOBS_PER_SEARCH,
  LINKEDIN_MAX_JOBS_PER_QUERY,
  LINKEDIN_MAX_JOBS_PER_RUN,
  LINKEDIN_SEARCH_QUERIES,
} from "../app/lib/linkedin/intakeConfig";
import {
  canonicalLinkedInJobUrl,
  linkedInSearchUrl,
  parseLinkedInJobIdFromUrl,
} from "../app/lib/linkedin/linkedinJob";
import { scoreLinkedInJob } from "../app/lib/linkedin/relevance";
import { cleanLinkedInJobTitle, scrapeLinkedInJobDetailPage } from "../app/lib/linkedin/scrapeJobDetail";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const stateDir = join(homedir(), ".eod-hub");
const authPath = join(stateDir, "linkedin-auth.json");
const lastRunPath = join(stateDir, "linkedin-last-run.json");

// Plain strings — tsx injects __name into page.evaluate() callbacks and breaks Playwright.
const SCRAPE_LINKEDIN_SEARCH_RESULTS = `(() => {
  const results = [];
  const cards = document.querySelectorAll(
    'li.scaffold-layout__list-item, li.jobs-search-results__list-item, div.job-search-card, div.base-card',
  );

  for (const el of cards) {
    const link =
      el.querySelector('a[href*="/jobs/view/"]') ??
      el.querySelector('a.base-card__full-link');
    if (!link || !link.href) continue;

    const match = link.href.match(/\\/jobs\\/view\\/(\\d+)/i);
    if (!match) continue;

    const title =
      el.querySelector('.base-search-card__title')?.textContent?.trim() ??
      el.querySelector('.job-card-list__title')?.textContent?.trim() ??
      link.textContent?.trim() ??
      '';

    const companyName =
      el.querySelector('.base-search-card__subtitle')?.textContent?.trim() ??
      el.querySelector('.job-card-container__company-name')?.textContent?.trim() ??
      el.querySelector('.artdeco-entity-lockup__subtitle')?.textContent?.trim() ??
      '';

    const locationText =
      el.querySelector('.job-search-card__location')?.textContent?.trim() ??
      el.querySelector('.artdeco-entity-lockup__caption')?.textContent?.trim() ??
      '';

    const description =
      el.querySelector('.job-search-card__snippet')?.textContent?.trim() ??
      el.querySelector('.base-search-card__metadata')?.textContent?.trim() ??
      '';

    if (!title) continue;

    results.push({
      linkedinJobId: match[1],
      title,
      companyName,
      location: locationText,
      description,
      applyUrl: 'https://www.linkedin.com/jobs/view/' + match[1] + '/',
    });
  }

  return results;
})()`;

type ScrapedJob = {
  linkedinJobId: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  applyUrl: string;
  searchQuery: string;
  relevanceScore: number;
};

function randomDelayMs(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

type CliFlags = {
  login: boolean;
  dryRun: boolean;
  force: boolean;
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

function parseFlags(argv: string[]): CliFlags {
  return {
    login: argv.includes("--login"),
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

function localMinutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isInImportWindow(): boolean {
  const minutes = localMinutesNow();
  return (
    minutes >= LINKEDIN_IMPORT_WINDOW_START_MINUTES &&
    minutes < LINKEDIN_IMPORT_WINDOW_END_MINUTES
  );
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hasRunToday(): boolean {
  if (!existsSync(lastRunPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(lastRunPath, "utf8")) as { date?: string };
    return parsed.date === todayKey();
  } catch {
    return false;
  }
}

function markRunToday() {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(lastRunPath, JSON.stringify({ date: todayKey(), at: new Date().toISOString() }, null, 2));
}

async function waitForNetwork(timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("https://www.linkedin.com/robots.txt", {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("Network unavailable — could not reach LinkedIn.");
}

async function runLogin() {
  mkdirSync(stateDir, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  console.log("Log in to LinkedIn in the browser window…");
  console.log("Session saves automatically once login completes (or press Enter here to save now).");

  const saveAndClose = async () => {
    await context.storageState({ path: authPath });
    await browser.close();
    console.log(`Saved session to ${authPath}`);
  };

  let saved = false;
  const saveOnce = async () => {
    if (saved) return;
    saved = true;
    await saveAndClose();
  };

  process.stdin.resume();
  process.stdin.once("data", () => {
    void saveOnce();
  });

  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline && !saved) {
    await page.waitForTimeout(2_000);
    const url = page.url();
    const loggedIn =
      !url.includes("/login") &&
      !url.includes("/checkpoint") &&
      (url.includes("linkedin.com/feed") ||
        url.includes("linkedin.com/jobs") ||
        url.includes("linkedin.com/in/"));
    if (loggedIn) {
      await page.waitForTimeout(2_000);
      await saveOnce();
      return;
    }
  }

  if (!saved) {
    await browser.close();
    throw new Error("Login timed out after 5 minutes. Re-run: npm run linkedin:login");
  }
}

async function assertLoggedIn(page: Page) {
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  const url = page.url();
  if (url.includes("/login") || url.includes("/checkpoint")) {
    throw new Error(
      "LinkedIn session expired or checkpoint required. Re-run: npx tsx scripts/linkedin-jobs-import.ts --login",
    );
  }
}

async function scrapeSearchPage(
  page: Page,
  keywords: string,
  location: string,
  searchQuery: string,
): Promise<ScrapedJob[]> {
  const url = linkedInSearchUrl(keywords, location);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_500);

  // Scroll to load more cards
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1_200);
  }

  const raw = (await page.evaluate(SCRAPE_LINKEDIN_SEARCH_RESULTS)) as Array<{
    linkedinJobId: string;
    title: string;
    companyName: string;
    location: string;
    description: string;
    applyUrl: string;
  }>;

  const jobs: ScrapedJob[] = [];
  for (const item of raw.slice(0, LINKEDIN_JOBS_PER_SEARCH)) {
    const jobId = parseLinkedInJobIdFromUrl(item.applyUrl) ?? item.linkedinJobId;
    const title = cleanLinkedInJobTitle(item.title);

    const detail = await scrapeLinkedInJobDetailPage(page, item.applyUrl);
    const description = detail.description || item.description;
    const companyName = detail.companyName || item.companyName;
    const location = detail.location || item.location;

    const relevance = scoreLinkedInJob(
      {
        title: detail.title || title,
        description,
        companyName,
      },
      { searchQuery },
    );
    if (!relevance.relevant) continue;

    jobs.push({
      linkedinJobId: jobId,
      title: detail.title || title,
      companyName: companyName || "Unknown employer",
      location,
      description,
      applyUrl: canonicalLinkedInJobUrl(jobId),
      searchQuery,
      relevanceScore: relevance.score,
    });

    await page.waitForTimeout(randomDelayMs(800, 1_800));
  }

  return jobs;
}

async function scrapeAll(context: BrowserContext): Promise<ScrapedJob[]> {
  const page = await context.newPage();
  await assertLoggedIn(page);

  const seen = new Set<string>();
  const collected: ScrapedJob[] = [];

  for (const query of LINKEDIN_SEARCH_QUERIES) {
    if (collected.length >= LINKEDIN_MAX_JOBS_PER_RUN) break;

    console.log(`Searching LinkedIn: ${query.keywords} (${query.location})…`);
    const batch = await scrapeSearchPage(page, query.keywords, query.location, query.id);
    let addedFromQuery = 0;
    for (const job of batch) {
      if (collected.length >= LINKEDIN_MAX_JOBS_PER_RUN) break;
      if (addedFromQuery >= LINKEDIN_MAX_JOBS_PER_QUERY) break;
      if (seen.has(job.linkedinJobId)) continue;
      seen.add(job.linkedinJobId);
      collected.push(job);
      addedFromQuery++;
    }

    await page.waitForTimeout(2_000 + Math.floor(Math.random() * 1_500));
  }

  await page.close();
  return collected;
}

async function postToImportApi(jobs: ScrapedJob[]) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("Missing CRON_SECRET in .env.local");

  const base =
    process.env.LINKEDIN_IMPORT_API_BASE?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.eod-hub.com";

  const res = await fetch(
    `${base.replace(/\/$/, "")}/api/import-linkedin?secret=${encodeURIComponent(secret)}`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobs }),
    },
  );

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Import API HTTP ${res.status}`);
  }
  return body;
}

async function main() {
  loadEnvLocal();
  const flags = parseFlags(process.argv.slice(2));

  if (flags.login) {
    await runLogin();
    return;
  }

  if (!flags.force) {
    if (!isInImportWindow()) {
      console.log("outside_import_window — skipping (use --force to override)");
      return;
    }
    if (hasRunToday()) {
      console.log("already_ran_today — skipping (use --force to override)");
      return;
    }
  }

  if (!existsSync(authPath)) {
    console.error(`No LinkedIn session at ${authPath}. Run with --login first.`);
    process.exit(1);
  }

  await waitForNetwork();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: authPath });
  let jobs: ScrapedJob[] = [];

  try {
    jobs = await scrapeAll(context);
  } finally {
    await browser.close();
  }

  console.log(`Scraped ${jobs.length} relevant job(s).`);
  for (const job of jobs) {
    const descNote =
      job.description.length > 0 ? `${job.description.length} chars` : "no description";
    console.log(`  • [${job.relevanceScore}] ${job.title} — ${job.companyName} (${descNote})`);
  }

  if (jobs.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  if (flags.dryRun) {
    console.log("Dry run — not posting to import API.");
    return;
  }

  const result = await postToImportApi(jobs);
  markRunToday();
  console.log("Import API response:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
