/** LinkedIn job search queries run by the local Playwright importer. */
export const LINKEDIN_SEARCH_QUERIES = [
  { id: "eod", keywords: "EOD", location: "United States" },
  { id: "uxo", keywords: "UXO", location: "United States" },
  { id: "eod-full", keywords: "Explosive Ordnance Disposal", location: "United States" },
] as const;

/** Max listings sent to the import API per run (after relevance filter). */
export const LINKEDIN_MAX_JOBS_PER_RUN = 25;

/** Max cards scraped per search before moving to the next query. */
export const LINKEDIN_JOBS_PER_SEARCH = 15;

/** Local run window: 4:30 AM – before 8:00 AM (minutes from midnight, local time). */
export const LINKEDIN_IMPORT_WINDOW_START_MINUTES = 4 * 60 + 30;
export const LINKEDIN_IMPORT_WINDOW_END_MINUTES = 8 * 60;
