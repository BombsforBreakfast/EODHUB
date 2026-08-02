/**
 * LinkedIn job search queries for the local Playwright importer.
 *
 * Aligned with USAJobs / Adzuna keyword channels. Each query runs once per
 * import; results are deduped by LinkedIn job ID. Per-query caps keep every
 * category represented even when early searches return many hits.
 *
 * International HMA: demining / mine-action keywords across a short country
 * allowlist (plus US). Core EOD/UXO/C-IED stay US-focused so scrape time stays
 * bounded; expand locations later if daily runs have headroom.
 */

export type LinkedInSearchQuery = {
  id: string;
  keywords: string;
  location: string;
};

/**
 * US + high-signal markets for HMA / demining LinkedIn searches.
 * Kept lean after LinkedIn rate warnings — expand only if runs stay clean.
 */
export const LINKEDIN_HMA_LOCATIONS = [
  "United States",
  "United Kingdom",
  "Australia",
  "Ukraine",
] as const;

const LINKEDIN_HMA_KEYWORD_SEEDS: ReadonlyArray<{ id: string; keywords: string }> = [
  { id: "hma-demining", keywords: "demining" },
  { id: "hma-mine-action", keywords: "mine action" },
  { id: "hma-humanitarian", keywords: "humanitarian mine action" },
  { id: "hma-uxo-clearance", keywords: "UXO clearance" },
];

function hmaQueriesForLocations(): LinkedInSearchQuery[] {
  const out: LinkedInSearchQuery[] = [];
  for (const loc of LINKEDIN_HMA_LOCATIONS) {
    const locSlug = loc.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const seed of LINKEDIN_HMA_KEYWORD_SEEDS) {
      out.push({
        id: `${seed.id}@${locSlug}`,
        keywords: seed.keywords,
        location: loc,
      });
    }
  }
  return out;
}

/** Core US contractor / federal-adjacent LinkedIn searches. */
const LINKEDIN_US_CORE_QUERIES: LinkedInSearchQuery[] = [
  // EOD
  { id: "eod", keywords: "EOD", location: "United States" },
  { id: "eod-full", keywords: "Explosive Ordnance Disposal", location: "United States" },
  { id: "direct-action-eod", keywords: "Direct Action EOD", location: "United States" },

  // UXO
  { id: "uxo", keywords: "UXO", location: "United States" },
  { id: "uxo-full", keywords: "Unexploded Ordnance", location: "United States" },

  // C-IED / CIED (one acronym + one expanded form)
  { id: "cied", keywords: "C-IED", location: "United States" },
  { id: "cied-full", keywords: "Counter IED", location: "United States" },

  // UAS / C-UAS
  { id: "uas", keywords: "UAS", location: "United States" },
  { id: "cuas", keywords: "C-UAS", location: "United States" },

  // CWMD / WMD
  { id: "cwmd", keywords: "CWMD", location: "United States" },
  { id: "wmd", keywords: "WMD", location: "United States" },

  // Explosive safety
  { id: "explosive-safety", keywords: "Explosive Safety", location: "United States" },
];

/**
 * Lean EOD/UXO searches for the same intl markets as HMA (not the full US set).
 * Keeps multi-country coverage without exploding scrape time.
 */
const LINKEDIN_INTL_CORE_KEYWORD_SEEDS: ReadonlyArray<{ id: string; keywords: string }> = [
  { id: "eod", keywords: "EOD" },
  { id: "uxo", keywords: "UXO" },
  { id: "explosive-ordnance", keywords: "Explosive Ordnance Disposal" },
];

function intlCoreQueries(): LinkedInSearchQuery[] {
  const out: LinkedInSearchQuery[] = [];
  for (const loc of LINKEDIN_HMA_LOCATIONS) {
    if (loc === "United States") continue;
    const locSlug = loc.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const seed of LINKEDIN_INTL_CORE_KEYWORD_SEEDS) {
      out.push({
        id: `${seed.id}@${locSlug}`,
        keywords: seed.keywords,
        location: loc,
      });
    }
  }
  return out;
}

export const LINKEDIN_SEARCH_QUERIES: LinkedInSearchQuery[] = [
  ...LINKEDIN_US_CORE_QUERIES,
  ...hmaQueriesForLocations(),
  ...intlCoreQueries(),
];

/**
 * Max unique listings imported per calendar run (API accepts up to 50 by default
 * on the import route; raised slightly so intl HMA can land alongside US core).
 */
export const LINKEDIN_MAX_JOBS_PER_RUN = 40;

/** Max relevant jobs kept from each search query (ensures category coverage). */
export const LINKEDIN_MAX_JOBS_PER_QUERY = 2;

/** Max job cards considered per search before relevance filtering / detail fetch. */
export const LINKEDIN_JOBS_PER_SEARCH = 8;

/** Local run window: 4:30 AM – before 8:00 AM (minutes from midnight, local time). */
export const LINKEDIN_IMPORT_WINDOW_START_MINUTES = 4 * 60 + 30;
export const LINKEDIN_IMPORT_WINDOW_END_MINUTES = 8 * 60;

/**
 * Minimum calendar days between successful guarded imports (3 = every third day).
 * Raised after LinkedIn rate / plugin warnings.
 */
export const LINKEDIN_MIN_DAYS_BETWEEN_RUNS = 3;

/** Pause between LinkedIn search pages (human-ish pacing). */
export const LINKEDIN_DELAY_BETWEEN_SEARCHES_MS = { min: 6_000, max: 12_000 } as const;

/** Pause between job detail page opens. */
export const LINKEDIN_DELAY_BETWEEN_DETAILS_MS = { min: 2_500, max: 5_000 } as const;
