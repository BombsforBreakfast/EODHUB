/**
 * Adzuna intake channels — parallel strategies beyond a single keyword list.
 *
 * The API `what` parameter matches title + description, but the legacy importer
 * only kept rows whose *title* contained EOD terms. These channels add employer
 * and category passes so good listings are not dropped at the gate.
 *
 * Multi-country: US runs the full channel set. Other allowlisted countries run
 * a lean keyword subset only (keeps cron API calls bounded).
 */

export type AdzunaKeywordChannel = {
  id: string;
  what: string;
  maxPages: number;
  maxDaysOld: number;
};

export type AdzunaCompanyChannel = {
  id: string;
  company: string;
  /** Narrow large employers; omit to fetch all company listings and score in-app. */
  what?: string;
  maxPages: number;
  maxDaysOld: number;
};

export type AdzunaCategoryChannel = {
  id: string;
  category: string;
  what: string;
  maxPages: number;
  maxDaysOld: number;
};

/** ISO 3166-1 alpha-2 codes supported by Adzuna's `/jobs/{country}/search` API. */
export type AdzunaCountryCode = "us" | "gb" | "au" | "ca" | "za";

/** Primary market — full keyword + company + category intake. */
export const ADZUNA_PRIMARY_COUNTRY: AdzunaCountryCode = "us";

/**
 * Countries to search. US keeps full channels; others use
 * {@link ADZUNA_INTL_KEYWORD_CHANNELS} only.
 */
export const ADZUNA_COUNTRIES: readonly AdzunaCountryCode[] = [
  "us",
  "gb",
  "au",
  "ca",
  "za",
];

/** @deprecated Use {@link ADZUNA_PRIMARY_COUNTRY} / {@link ADZUNA_COUNTRIES}. */
export const ADZUNA_COUNTRY = ADZUNA_PRIMARY_COUNTRY;

export const ADZUNA_RESULTS_PER_PAGE = 50;

/** Primary keyword searches (title + description on Adzuna's side) — US full set. */
export const ADZUNA_KEYWORD_CHANNELS: AdzunaKeywordChannel[] = [
  { id: "kw:eod-core", what: "explosive ordnance disposal", maxPages: 3, maxDaysOld: 90 },
  { id: "kw:uxo", what: "UXO technician OR unexploded ordnance", maxPages: 3, maxDaysOld: 90 },
  { id: "kw:bomb", what: "bomb technician OR bomb squad OR hazardous devices", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:cbrn", what: "CBRN OR CBRNE OR chemical biological radiological", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:cied", what: "C-IED OR counter IED OR improvised explosive OR IEDD", maxPages: 3, maxDaysOld: 90 },
  { id: "kw:demining", what: "demining OR mine action OR humanitarian mine action OR HMA", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:ordnance", what: "ordnance disposal OR ammunition technician OR munitions", maxPages: 3, maxDaysOld: 90 },
  { id: "kw:uas", what: "UAS OR unmanned aerial OR counter UAS OR C-UAS OR drone operator", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:safety", what: "explosive safety OR render safe OR ammunition handler", maxPages: 2, maxDaysOld: 90 },
];

/**
 * Lean keyword set for non-US Adzuna countries — EOD/UXO/HMA focus, fewer pages.
 * Company/category channels stay US-only (employer names / taxonomy differ by market).
 */
export const ADZUNA_INTL_KEYWORD_CHANNELS: AdzunaKeywordChannel[] = [
  { id: "kw:eod-core", what: "explosive ordnance disposal OR EOD", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:uxo", what: "UXO technician OR unexploded ordnance OR UXO", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:demining", what: "demining OR mine action OR humanitarian mine action OR HMA", maxPages: 2, maxDaysOld: 90 },
  { id: "kw:cied", what: "C-IED OR counter IED OR improvised explosive OR IEDD", maxPages: 1, maxDaysOld: 90 },
  { id: "kw:ordnance", what: "ordnance disposal OR munitions clearance", maxPages: 1, maxDaysOld: 90 },
];

/**
 * Employers that frequently post EOD/UXO/ordnance roles under generic titles.
 * Company filter matches the hiring organization, not the headline.
 *
 * Some employer names return HTTP 400 from Adzuna (PAE, Parsons, etc.) — keep
 * only names verified against the live API. US-only.
 */
export const ADZUNA_COMPANY_CHANNELS: AdzunaCompanyChannel[] = [
  { id: "co:amentum", company: "Amentum", what: "ordnance OR explosive OR ammunition OR EOD OR UXO", maxPages: 2, maxDaysOld: 90 },
  { id: "co:leidos", company: "Leidos", what: "ordnance OR explosive OR EOD OR CBRN OR UXO", maxPages: 2, maxDaysOld: 90 },
  { id: "co:kbr", company: "KBR", what: "ordnance OR explosive OR EOD OR ammunition", maxPages: 2, maxDaysOld: 90 },
];

/** Category + keyword combos for roles that rarely say EOD in the title. US-only. */
export const ADZUNA_CATEGORY_CHANNELS: AdzunaCategoryChannel[] = [
  {
    id: "cat:engineering-ordnance",
    category: "engineering-jobs",
    what: "ordnance OR explosive OR ammunition OR UXO OR EOD",
    maxPages: 2,
    maxDaysOld: 60,
  },
  {
    id: "cat:trade-ordnance",
    category: "trade-construction-jobs",
    what: "ordnance OR explosive OR bomb OR ammunition",
    maxPages: 2,
    maxDaysOld: 60,
  },
];

/** Excluded at API layer on keyword/category searches to reduce enlistment noise. */
export const ADZUNA_WHAT_EXCLUDE =
  "recruiter OR rotc OR enlistment OR \"basic training\" OR \"officer candidate\"";

export function adzunaKeywordChannelsForCountry(
  country: AdzunaCountryCode,
): AdzunaKeywordChannel[] {
  return country === ADZUNA_PRIMARY_COUNTRY
    ? ADZUNA_KEYWORD_CHANNELS
    : ADZUNA_INTL_KEYWORD_CHANNELS;
}
