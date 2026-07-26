/**
 * Audit international EOD/HMA job coverage across import sources.
 *
 * Usage:
 *   npx tsx scripts/audit-intl-job-coverage.ts
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

type JobRow = {
  id: string;
  source_type: string | null;
  title: string | null;
  location: string | null;
  description: string | null;
  created_at: string;
  is_approved: boolean | null;
  import_metadata: Record<string, unknown> | null;
};

const HMA_RE = /\b(demining|mine\s*action|humanitarian\s*mine\s*action|\bhma\b|land\s*release|eore|unmas|halo\s*trust|\bmag\b|norwegian\s*people'?s?\s*aid|\bnpa\b|gichd)\b/i;
const EOD_RE = /\b(eod|explosive\s*ordnance|uxo|unexploded\s*ordnance|\bcied\b|c-ied|erw|iedd)\b/i;
const US_LOC_RE =
  /\b(united\s*states|\bUSA\b|\bU\.S\.A\.?\b|\bUS\b|virginia|texas|california|florida|georgia|north\s*carolina|south\s*carolina|conus|washington,?\s*d\.?c\.?)\b/i;

function isHmaish(title: string, description: string): boolean {
  return HMA_RE.test(title) || HMA_RE.test(description);
}

function isEodish(title: string, description: string): boolean {
  return EOD_RE.test(title) || EOD_RE.test(description);
}

function looksNonUs(location: string, countries: unknown): boolean {
  if (Array.isArray(countries) && countries.length > 0) {
    const names = countries.map((c) => String(c).toLowerCase());
    const onlyUs = names.every(
      (n) => n.includes("united states") || n === "us" || n === "usa" || n.includes("america"),
    );
    if (!onlyUs) return true;
  }
  if (!location.trim()) return false;
  if (US_LOC_RE.test(location)) return false;
  // Heuristic: has a country-like token and is not clearly US
  return /[a-z]{3,}/i.test(location);
}

async function fetchJobsSince(iso: string): Promise<JobRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: JobRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, source_type, title, location, description, created_at, is_approved, import_metadata")
      .gte("created_at", iso)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as JobRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function aggregate(jobs: JobRow[], windowLabel: string) {
  const bySource: Record<
    string,
    {
      total: number;
      approved: number;
      pending: number;
      hmaish: number;
      eodish: number;
      nonUsLocation: number;
      withCountriesMeta: number;
    }
  > = {};

  const reliefwebCountries = new Map<string, number>();
  const sampleNonUs: Array<{ source_type: string; title: string; location: string }> = [];
  const sampleHma: Array<{ source_type: string; title: string; location: string }> = [];

  for (const j of jobs) {
    const src = (j.source_type || "unknown").toLowerCase();
    if (!bySource[src]) {
      bySource[src] = {
        total: 0,
        approved: 0,
        pending: 0,
        hmaish: 0,
        eodish: 0,
        nonUsLocation: 0,
        withCountriesMeta: 0,
      };
    }
    const bucket = bySource[src];
    bucket.total += 1;
    if (j.is_approved) bucket.approved += 1;
    else bucket.pending += 1;

    const title = j.title ?? "";
    const description = j.description ?? "";
    const location = j.location ?? "";
    const meta = j.import_metadata ?? {};
    const countries = meta.countries;

    if (Array.isArray(countries) && countries.length) bucket.withCountriesMeta += 1;
    if (isHmaish(title, description)) {
      bucket.hmaish += 1;
      if (sampleHma.length < 15) {
        sampleHma.push({ source_type: src, title: title.slice(0, 120), location: location.slice(0, 80) });
      }
    }
    if (isEodish(title, description)) bucket.eodish += 1;

    const nonUs = looksNonUs(location, countries);
    if (nonUs) {
      bucket.nonUsLocation += 1;
      if (sampleNonUs.length < 20) {
        sampleNonUs.push({ source_type: src, title: title.slice(0, 120), location: location.slice(0, 80) });
      }
    }

    if (src === "reliefweb" && Array.isArray(countries)) {
      for (const c of countries) {
        const key = String(c).trim() || "(blank)";
        reliefwebCountries.set(key, (reliefwebCountries.get(key) ?? 0) + 1);
      }
    }
  }

  const reliefwebTopCountries = [...reliefwebCountries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([country, count]) => ({ country, count }));

  return {
    window: windowLabel,
    jobCount: jobs.length,
    bySource,
    reliefwebTopCountries,
    sampleNonUs,
    sampleHma,
  };
}

async function main() {
  const now = new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);

  const [jobs30, jobs90] = await Promise.all([
    fetchJobsSince(d30.toISOString()),
    fetchJobsSince(d90.toISOString()),
  ]);

  // All-time source counts (head count only)
  const sources = ["usajobs", "adzuna", "linkedin", "reliefweb"] as const;
  const allTime: Record<string, number | null> = {};
  for (const s of sources) {
    const { count, error } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("source_type", s);
    allTime[s] = error ? null : (count ?? 0);
  }

  const report = {
    generatedAt: now.toISOString(),
    allTimeCountsBySource: allTime,
    last30Days: aggregate(jobs30, "30d"),
    last90Days: aggregate(jobs90, "90d"),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
