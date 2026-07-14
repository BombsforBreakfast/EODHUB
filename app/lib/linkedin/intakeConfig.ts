/**
 * LinkedIn job search queries for the local Playwright importer.
 *
 * Aligned with USAJobs / Adzuna keyword channels. Each query runs once per
 * import; results are deduped by LinkedIn job ID. Per-query caps keep every
 * category represented even when early searches return many hits.
 */

export type LinkedInSearchQuery = {
  id: string;
  keywords: string;
  location: string;
};

export const LINKEDIN_SEARCH_QUERIES: LinkedInSearchQuery[] = [
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

/** Max unique listings imported per calendar run (API accepts up to 50). */
export const LINKEDIN_MAX_JOBS_PER_RUN = 50;

/** Max relevant jobs kept from each search query (ensures category coverage). */
export const LINKEDIN_MAX_JOBS_PER_QUERY = 4;

/** Max job cards scraped per search before relevance filtering. */
export const LINKEDIN_JOBS_PER_SEARCH = 15;

/** Local run window: 4:30 AM – before 8:00 AM (minutes from midnight, local time). */
export const LINKEDIN_IMPORT_WINDOW_START_MINUTES = 4 * 60 + 30;
export const LINKEDIN_IMPORT_WINDOW_END_MINUTES = 8 * 60;
