import { FACET_OPTIONS, deriveJobFacets, jobEmploymentTypes, plainJobText, type FacetKey, type JobFacets } from "./jobFacets";

export type JobListItem = {
  id: string;
  created_at: string | null;
  title: string | null;
  category: string | null;
  location: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  description: string | null;
  apply_url: string | null;
  company_name: string | null;
  source_type: string | null;
  applications_under_review?: boolean | null;
  user_id?: string | null;
  anonymous?: boolean | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  filter_overrides?: unknown;
  filter_source?: unknown;
  facets?: JobFacets;
};

export type SalaryMin = 25000 | 50000 | 75000 | 100000 | 125000 | 150000;

export type JobFilterState = {
  keyword: string;
  locationRegion: string;
  salaryMin: SalaryMin | "";
  regions?: string[];
  geography?: "" | "conus" | "oconus";
  includeUnknownLocation?: boolean;
  excludeKeywords?: string;
  searchScope?: "all" | "title";
  selections?: Partial<Record<FacetKey, string[]>>;
  minimumPay?: string;
  payPeriod?: "year" | "hour";
  payMatch?: "range" | "starting";
  includeUnknownPay?: boolean;
  advertisedPayOnly?: boolean;
  postedWithin?: "" | "7" | "14";
};

export const DEFAULT_JOB_FILTERS: JobFilterState = {
  keyword: "", locationRegion: "", salaryMin: "", regions: [], geography: "",
  includeUnknownLocation: false, excludeKeywords: "", searchScope: "all", selections: {},
  minimumPay: "", payPeriod: "year", payMatch: "range", includeUnknownPay: false,
  advertisedPayOnly: false, postedWithin: "",
};

/** Validate browser-saved preferences rather than trusting localStorage shape. */
export function restoreJobFilters(value: unknown): JobFilterState {
  const out = { ...DEFAULT_JOB_FILTERS, regions: [] as string[], selections: {} as Partial<Record<FacetKey, string[]>> };
  if (!value || typeof value !== "object") return out;
  const input = value as Record<string, unknown>;
  for (const key of ["keyword", "excludeKeywords", "minimumPay"] as const) if (typeof input[key] === "string") out[key] = input[key].slice(0, 300);
  if (out.minimumPay && (!Number.isFinite(Number(out.minimumPay)) || Number(out.minimumPay) < 0)) out.minimumPay = "";
  if (Array.isArray(input.regions)) out.regions = input.regions.filter((v): v is string => typeof v === "string" && v.length < 100).slice(0, 100);
  for (const key of ["includeUnknownLocation", "includeUnknownPay", "advertisedPayOnly"] as const) out[key] = input[key] === true;
  if (input.searchScope === "title") out.searchScope = "title";
  if (input.payPeriod === "hour") out.payPeriod = "hour";
  if (input.payMatch === "starting") out.payMatch = "starting";
  if (input.geography === "conus" || input.geography === "oconus") out.geography = input.geography;
  if (input.postedWithin === "7" || input.postedWithin === "14") out.postedWithin = input.postedWithin;
  if (input.selections && typeof input.selections === "object") {
    for (const [key, values] of Object.entries(input.selections)) {
      if (Object.hasOwn(FACET_OPTIONS, key) && Array.isArray(values)) out.selections[key as FacetKey] = values.filter(v => typeof v === "string" && Object.hasOwn(FACET_OPTIONS[key as FacetKey], v));
    }
  }
  return out;
}

// ─── Region extraction ────────────────────────────────────────────────────────

const US_STATE_ABBRS = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

const STATE_NAME_TO_ABBR: Record<string, string> = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
  "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
  "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
  "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC", "washington d.c.": "DC", "washington dc": "DC",
};

const ABBR_TO_STATE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBR).map(([name, abbr]) => [abbr, name]),
);
ABBR_TO_STATE_NAME.DC = "District of Columbia";

export type JobRegionOption = {
  value: string;
  label: string;
};

// Phrases that mean "this segment is just the country suffix for a US address".
const US_SUFFIXES = new Set(["united states", "usa", "us", "u.s.", "u.s.a."]);

export function isUsStateAbbr(key: string): boolean {
  return US_STATE_ABBRS.has(key.toUpperCase());
}

/** Display label for a canonical region key (US abbr → full state name). */
export function regionDisplayLabel(key: string): string {
  const upper = key.toUpperCase();
  if (isUsStateAbbr(upper)) {
    const name = ABBR_TO_STATE_NAME[upper];
    if (name) {
      return name.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return key;
}

/** Normalize a filter value (abbr or full state name) to a canonical region key. */
export function resolveRegionFilter(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const upper = trimmed.replace(/\s/g, "").toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && US_STATE_ABBRS.has(upper)) return upper;

  const abbr = STATE_NAME_TO_ABBR[trimmed.toLowerCase()];
  if (abbr) return abbr;

  return trimmed;
}

/**
 * Given a raw job location string (e.g. "Norfolk, VA" or "Naples, Italy"),
 * return a normalised region label: a 2-letter US state abbreviation, or the
 * country/territory name for OCONUS postings.
 */
export function extractRegion(location: string | null): string | null {
  if (!location) return null;
  const loc = location.trim();
  if (!loc) return null;

  if (/^remote$/i.test(loc)) return "Remote";

  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  // Walk right-to-left so we can skip country/suffix segments.
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const lower = part.toLowerCase();

    // Skip generic US country suffixes and look left for the actual state.
    if (US_SUFFIXES.has(lower)) continue;

    // 2-letter US state abbreviation.
    const upper = part.replace(/\s/g, "").toUpperCase();
    if (/^[A-Z]{2}$/.test(upper) && US_STATE_ABBRS.has(upper)) return upper;

    // Full US state name → abbreviation.
    const abbr = STATE_NAME_TO_ABBR[lower];
    if (abbr) return abbr;

    // Keep looking: a county/city suffix is not necessarily a country.
    const stateWithZip = part.match(/^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/i);
    if (stateWithZip && US_STATE_ABBRS.has(stateWithZip[1].toUpperCase())) return stateWithZip[1].toUpperCase();
    if (/^d\.?c\.?$/i.test(part)) return "DC";
    if (KNOWN_COUNTRIES.has(lower)) return KNOWN_COUNTRIES.get(lower)!;
  }

  return null;
}

const KNOWN_COUNTRIES = new Map([
  "Afghanistan", "Albania", "Angola", "Australia", "Austria", "Belgium", "Bosnia and Herzegovina", "Cambodia", "Canada", "Chad", "Colombia", "Croatia", "Cyprus", "Denmark", "Egypt", "Ethiopia", "Finland", "France", "Germany", "Greece", "India", "Indonesia", "Iraq", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kenya", "Kuwait", "Laos", "Lebanon", "Libya", "Mali", "Mozambique", "Myanmar", "Netherlands", "New Zealand", "Nigeria", "Norway", "Pakistan", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Saudi Arabia", "Senegal", "Serbia", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Thailand", "Turkey", "Ukraine", "United Arab Emirates", "United Kingdom", "Vietnam", "Yemen", "Zambia", "Zimbabwe", "Guam", "Puerto Rico"
].map(name => [name.toLowerCase(), name]));
KNOWN_COUNTRIES.set("uk", "United Kingdom");
KNOWN_COUNTRIES.set("uae", "United Arab Emirates");

export function jobRegions(job: JobListItem): string[] {
  const source = job.filter_source && typeof job.filter_source === "object" ? job.filter_source as Record<string, unknown> : {};
  const areas = Array.isArray(source.locationAreas) ? source.locationAreas.filter((a): a is string => typeof a === "string") : [];
  const locations = [...areas, ...(job.location ?? "").split(/;|\s+\|\s+/)];
  const regions = [...new Set(locations.map(extractRegion).filter((v): v is string => !!v && v !== "Remote"))];
  // Prefer state-level choices to a generic country when both are present.
  if (regions.some(isUsStateAbbr)) return regions.filter(r => r !== "United States");
  if (!regions.length && source.country === "us") return ["United States"];
  if (!regions.length && typeof source.country === "string") return [({ gb: "United Kingdom", au: "Australia", ca: "Canada", za: "South Africa" } as Record<string, string>)[source.country] ?? ""].filter(Boolean);
  if (!regions.length && /^(?:united states|usa|us)$/i.test((job.location ?? "").trim())) return ["United States"];
  return regions;
}

/**
 * Build sorted location dropdown options: US states (A–Z by full name), then international (A–Z).
 * Only regions present in the current job list are included.
 */
export function uniqueJobRegionOptions(jobs: JobListItem[]): JobRegionOption[] {
  const regions = new Set<string>();
  for (const job of jobs) {
    for (const region of jobRegions(job)) regions.add(region);
  }

  const usStates: JobRegionOption[] = [];
  const international: JobRegionOption[] = [];

  for (const value of regions) {
    const option = { value, label: regionDisplayLabel(value) };
    if (isUsStateAbbr(value)) usStates.push(option);
    else international.push(option);
  }

  usStates.sort((a, b) => a.label.localeCompare(b.label));
  international.sort((a, b) => a.label.localeCompare(b.label));

  return [...usStates, ...international];
}

/**
 * @deprecated use uniqueJobRegionOptions instead
 */
export function uniqueJobRegions(jobs: JobListItem[]): string[] {
  return uniqueJobRegionOptions(jobs).map((o) => o.label);
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

/** Words use AND; double-quoted phrases stay together. Exclusions use OR. */
export function searchTerms(value: string): string[] {
  return (value.toLowerCase().match(/"[^"]+"|[^\s,]+/g) ?? []).map(v => v.replace(/^"|"$/g, "")).filter(Boolean);
}

export function applyJobFilters(jobs: JobListItem[], filters: JobFilterState, now = Date.now()): JobListItem[] {
  const keywords = searchTerms(filters.keyword);
  const excluded = searchTerms(filters.excludeKeywords ?? "");
  const selectedRegions = filters.regions?.length ? filters.regions : filters.locationRegion ? [resolveRegionFilter(filters.locationRegion)] : [];
  const minimum = Number(filters.minimumPay || filters.salaryMin || 0);
  return jobs.filter(job => {
    const facets = job.facets ?? deriveJobFacets(job);
    const haystack = plainJobText(filters.searchScope === "title" ? job.title || job.og_title : [job.title, job.og_title, job.description, job.og_description, job.company_name, job.category, job.clearance].filter(Boolean).join(" ")).toLowerCase();
    if (!keywords.every(word => haystack.includes(word)) || excluded.some(word => haystack.includes(word))) return false;
    for (const [key, values] of Object.entries(filters.selections ?? {})) {
      if (key === "employment" && values?.length) {
        if (!jobEmploymentTypes(job).some(v => values.includes(v))) return false;
        continue;
      }
      if (values?.length && !values.includes(facets[key as FacetKey])) return false;
    }
    const regions = jobRegions(job);
    if (selectedRegions.length && !regions.some(r => selectedRegions.includes(r)) && !(filters.includeUnknownLocation && regions.length === 0)) return false;
    if (filters.geography) {
      const conus = (r: string) => isUsStateAbbr(r) && r !== "AK" && r !== "HI";
      const matches = filters.geography === "conus" ? regions.some(conus) : regions.some(r => !conus(r) && r !== "United States");
      if (!matches && !(filters.includeUnknownLocation && (regions.length === 0 || regions.every(r => r === "United States")))) return false;
    }
    if (filters.advertisedPayOnly && facets.payDisclosure !== "advertised") return false;
    if (minimum > 0) {
      const source = job.filter_source && typeof job.filter_source === "object" ? job.filter_source as Record<string, unknown> : {};
      // No silent currency conversion or assumption that a small annual stipend is hourly.
      const knownUsd = source.currency ? source.currency === "USD" : source.country === "us" || job.source_type !== "adzuna";
      const amount = filters.payMatch === "starting" ? job.pay_min : job.pay_max ?? job.pay_min;
      const known = knownUsd && facets.payPeriod === (filters.payPeriod ?? "year") && amount != null;
      if (!known) { if (!filters.includeUnknownPay) return false; }
      else if (amount! < minimum) return false;
    }
    if (filters.postedWithin) {
      const posted = Date.parse(job.created_at ?? "");
      if (!Number.isFinite(posted) || posted < now - Number(filters.postedWithin) * 86400000) return false;
    }
    return true;
  });
}

export function jobFilterChips(filters: JobFilterState): { label: string; clear: Partial<JobFilterState> }[] {
  const chips: { label: string; clear: Partial<JobFilterState> }[] = [];
  if (filters.keyword.trim()) chips.push({ label: `Search: ${filters.keyword}`, clear: { keyword: "" } });
  if (filters.searchScope === "title") chips.push({ label: "Search titles only", clear: { searchScope: "all" } });
  if (filters.excludeKeywords?.trim()) chips.push({ label: `Exclude: ${filters.excludeKeywords}`, clear: { excludeKeywords: "" } });
  for (const region of filters.regions ?? []) chips.push({ label: regionDisplayLabel(region), clear: { regions: filters.regions?.filter(r => r !== region) } });
  if (filters.geography) chips.push({ label: filters.geography.toUpperCase(), clear: { geography: "" } });
  for (const [key, values] of Object.entries(filters.selections ?? {})) for (const value of values ?? []) {
    chips.push({ label: (FACET_OPTIONS[key as FacetKey] as Record<string, string>)[value] ?? value, clear: { selections: { ...filters.selections, [key]: values.filter(v => v !== value) } } });
  }
  if (Number(filters.minimumPay) > 0) chips.push({ label: `${filters.payMatch === "starting" ? "Starting" : "Range reaches"} $${Number(filters.minimumPay).toLocaleString()}/${filters.payPeriod === "hour" ? "hr" : "yr"}`, clear: { minimumPay: "" } });
  if (filters.advertisedPayOnly) chips.push({ label: "Advertised pay only", clear: { advertisedPayOnly: false } });
  if (filters.includeUnknownPay) chips.push({ label: "Include unknown pay", clear: { includeUnknownPay: false } });
  if (filters.includeUnknownLocation) chips.push({ label: "Include unknown locations", clear: { includeUnknownLocation: false } });
  if (filters.postedWithin) chips.push({ label: `Last ${filters.postedWithin} days`, clear: { postedWithin: "" } });
  return chips;
}

/** @deprecated use uniqueJobRegions instead */
export function uniqueJobLocations(jobs: JobListItem[]): string[] {
  return [...new Set(jobs.map((j) => (j.location ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
