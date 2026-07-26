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

/** US + high-signal markets for HMA / demining LinkedIn searches. */
export const LINKEDIN_HMA_LOCATIONS = [
  "United States",
  "United Kingdom",
  "Australia",
  "Canada",
  "South Africa",
  "Ukraine",
  "Germany",
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

  // C-IED / CIED
  { id: "cied", keywords: "C-IED", location: "United States" },
  { id: "cied-alt", keywords: "CIED", location: "United States" },
  { id: "cied-full", keywords: "Counter IED", location: "United States" },
  { id: "ied", keywords: "Improvised Explosive Device", location: "United States" },

  // UAS
  { id: "uas", keywords: "UAS", location: "United States" },
  { id: "uas-full", keywords: "Unmanned Aerial Systems", location: "United States" },

  // C-UAS
  { id: "cuas", keywords: "C-UAS", location: "United States" },
  { id: "cuas-full", keywords: "Counter UAS", location: "United States" },

  // CWMD / WMD
  { id: "cwmd", keywords: "CWMD", location: "United States" },
  { id: "cwmd-alt", keywords: "C-WMD", location: "United States" },
  { id: "cwmd-full", keywords: "Counter Weapons of Mass Destruction", location: "United States" },
  { id: "wmd", keywords: "WMD", location: "United States" },
  { id: "wmd-full", keywords: "Weapons of Mass Destruction", location: "United States" },

  // Explosive safety
  { id: "explosive-safety", keywords: "Explosive Safety", location: "United States" },
  { id: "explosives-specialist", keywords: "Explosives Specialist", location: "United States" },
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
export const LINKEDIN_MAX_JOBS_PER_RUN = 60;

/** Max relevant jobs kept from each search query (ensures category coverage). */
export const LINKEDIN_MAX_JOBS_PER_QUERY = 3;

/** Max job cards scraped per search before relevance filtering. */
export const LINKEDIN_JOBS_PER_SEARCH = 15;

/** Local run window: 4:30 AM – before 8:00 AM (minutes from midnight, local time). */
export const LINKEDIN_IMPORT_WINDOW_START_MINUTES = 4 * 60 + 30;
export const LINKEDIN_IMPORT_WINDOW_END_MINUTES = 8 * 60;
