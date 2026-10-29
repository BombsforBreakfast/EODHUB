import { FACET_OPTIONS, deriveJobFacets, jobEmploymentTypes, plainJobText, type FacetKey, type JobFacets } from "./jobFacets";
import { cleanJobLocation, inferUsLocation, type JobLocationResolution } from "./jobLocationInference";

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
  geographies?: ("conus" | "oconus")[];
  employers?: string[];
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
  keyword: "", locationRegion: "", salaryMin: "", regions: [], geography: "", geographies: [], employers: [],
  includeUnknownLocation: false, excludeKeywords: "", searchScope: "all", selections: {},
  minimumPay: "", payPeriod: "year", payMatch: "range", includeUnknownPay: false,
  advertisedPayOnly: false, postedWithin: "",
};

/** Validate browser-saved preferences rather than trusting localStorage shape. */
export function restoreJobFilters(value: unknown): JobFilterState {
  const out = { ...DEFAULT_JOB_FILTERS, regions: [] as string[], geographies: [] as ("conus" | "oconus")[], employers: [] as string[], selections: {} as Partial<Record<FacetKey, string[]>> };
  if (!value || typeof value !== "object") return out;
  const input = value as Record<string, unknown>;
  for (const key of ["keyword", "excludeKeywords", "minimumPay"] as const) if (typeof input[key] === "string") out[key] = input[key].slice(0, 300);
  if (out.minimumPay && (!Number.isFinite(Number(out.minimumPay)) || Number(out.minimumPay) < 0)) out.minimumPay = "";
  if (Array.isArray(input.regions)) out.regions = [...new Set(input.regions.filter((v): v is string => typeof v === "string" && v.length < 100).slice(0, 100).map(resolveRegionFilter))];
  // Employer selection was retired. Old preferences must not hide listings.
  for (const key of ["includeUnknownLocation", "includeUnknownPay", "advertisedPayOnly"] as const) out[key] = input[key] === true;
  if (input.searchScope === "title") out.searchScope = "title";
  if (input.payPeriod === "hour") out.payPeriod = "hour";
  if (input.payMatch === "starting") out.payMatch = "starting";
  if (Array.isArray(input.geographies)) out.geographies = [...new Set(input.geographies.filter((v): v is "conus" | "oconus" => v === "conus" || v === "oconus"))];
  else if (input.geography === "conus" || input.geography === "oconus") out.geographies = [input.geography];
  if (input.postedWithin === "7" || input.postedWithin === "14") out.postedWithin = input.postedWithin;
  if (input.selections && typeof input.selections === "object") {
    for (const [key, values] of Object.entries(input.selections)) {
      if (key === "workplace") continue;
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
  "puerto rico": "PR",
};

const ABBR_TO_STATE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBR).map(([name, abbr]) => [abbr, name]),
);
ABBR_TO_STATE_NAME.DC = "District of Columbia";

export type JobRegionOption = {
  value: string;
  label: string;
};

/** Census region shortcuts. Puerto Rico remains individually selectable. */
export const US_JOB_REGION_GROUPS = [
  { label: "Northeast", states: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"] },
  { label: "Midwest", states: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"] },
  { label: "South", states: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"] },
  { label: "West", states: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"] },
] as const;

export function toggleJobRegionGroup(selected: string[], members: readonly string[]): string[] {
  return members.every(value => selected.includes(value)) ? selected.filter(value => !members.includes(value)) : [...new Set([...selected, ...members])];
}

// Phrases that mean "this segment is just the country suffix for a US address".
const US_SUFFIXES = new Set(["united states", "usa", "us", "u.s.", "u.s.a."]);

export function isUsStateAbbr(key: string): boolean {
  return US_STATE_ABBRS.has(key.toUpperCase());
}

/** Display label for a canonical region key (US abbr → full state name). */
export function regionDisplayLabel(key: string): string {
  if (key === "__unspecified__") return "Lacks location detail";
  const upper = key.toUpperCase();
  if (upper === "DC") return "District of Columbia";
  if (upper === "PR") return "Puerto Rico";
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
  if (upper === "PR") return "PR";
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
  const loc = cleanJobLocation(location);
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
    if (upper === "PR") return "PR";
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

/** Recognize explicit city/state or US-state hints in titles, not arbitrary
 * two-letter words (e.g. IN / OR in ordinary prose). */
function titleLocationStates(title: string | null | undefined): string[] {
  const matches = [...(title ?? "").matchAll(/(?:,\s*|\bUS[A]?\s*[-–—]\s*)([A-Z]{2})(?=\s*(?:$|[,()\-–—]))/g)];
  return [...new Set(matches.map(match => match[1]).filter(state => isUsStateAbbr(state) || state === "PR"))];
}

type JobLocationInput = { location?: string | null; title?: string | null; og_title?: string | null; filter_source?: unknown };

export function resolveJobLocation(job: JobLocationInput): JobLocationResolution {
  const source = job.filter_source && typeof job.filter_source === "object" ? job.filter_source as Record<string, unknown> : {};
  const areas = Array.isArray(source.locationAreas) ? source.locationAreas.filter((a): a is string => typeof a === "string") : [];
  const locations = [...areas, ...(job.location ?? "").split(/;|\s+\|\s+/)];
  let regions = [...new Set(locations.map(extractRegion).filter((v): v is string => !!v && v !== "Remote"))];
  const explicit = regions.length > 0;
  const canInferUs = !source.country || source.country === "us";
  const guesses = !explicit && canInferUs ? (job.location ?? "").split(/;|\s+\|\s+/).map(inferUsLocation) : [];
  const possible = [...new Set(guesses.flatMap(guess => guess.candidates))];
  const titleStates = canInferUs ? titleLocationStates(job.title || job.og_title) : [];
  if (!explicit) regions = [...new Set(guesses.flatMap(guess => guess.state ? [guess.state] : []))];
  const fieldStates = regions.filter(state => isUsStateAbbr(state) || state === "PR");
  if (titleStates.length && fieldStates.length && !titleStates.some(state => fieldStates.includes(state))) {
    return { regions: [], status: "conflict", candidates: [...new Set([...fieldStates, ...titleStates])] };
  }
  if (!regions.length && titleStates.length) {
    if (possible.length && !titleStates.some(state => possible.includes(state))) return { regions: [], status: "conflict", candidates: [...new Set([...possible, ...titleStates])] };
    regions = titleStates;
  }
  const status = regions.length ? explicit ? "explicit" : "inferred" : "unspecified";
  // Prefer state-level choices to a generic country when both are present.
  if (regions.some(isUsStateAbbr)) regions = regions.filter(r => r !== "United States");
  if (!regions.length && source.country === "us") regions = ["United States"];
  if (!regions.length && typeof source.country === "string") regions = [({ gb: "United Kingdom", au: "Australia", ca: "Canada", za: "South Africa" } as Record<string, string>)[source.country] ?? ""].filter(Boolean);
  if (!regions.length && /^(?:united states|usa|us)$/i.test((job.location ?? "").trim())) regions = ["United States"];
  return { regions, status, candidates: possible };
}

export function jobRegions(job: JobListItem): string[] {
  return resolveJobLocation(job).regions;
}

export const JOB_LOCATION_UNSPECIFIED = "__unspecified__";

export function isUnspecifiedJobLocation(regions: string[]): boolean {
  return regions.length === 0 || regions.every(region => region === "United States");
}

export function jobLocationNote(job: JobLocationInput): string | null {
  const resolved = resolveJobLocation(job);
  if (resolved.status === "conflict") return "Location details conflict — verify with the employer";
  return resolved.status === "inferred" ? `Location matched to ${resolved.regions.map(regionDisplayLabel).join(" / ")}` : null;
}

/**
 * Build sorted location dropdown options: US states (A–Z by full name), then international (A–Z).
 * All 50 states, DC and Puerto Rico are always included. Other locations come
 * from the active inventory; a zero-listing state stays selectable.
 */
export function uniqueJobRegionOptions(jobs: JobListItem[]): JobRegionOption[] {
  const regions = new Set<string>([...US_STATE_ABBRS, "PR"]);
  for (const job of jobs) {
    const located = jobRegions(job);
    for (const region of located) regions.add(region);
    if (isUnspecifiedJobLocation(located)) regions.add(JOB_LOCATION_UNSPECIFIED);
  }

  const usStates: JobRegionOption[] = [];
  const international: JobRegionOption[] = [];

  for (const value of regions) {
    const option = { value, label: regionDisplayLabel(value) };
    if (isUsStateAbbr(value) || value === "PR") usStates.push(option);
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
  const selectedRegions = filters.regions?.length ? filters.regions.map(resolveRegionFilter) : filters.locationRegion ? [resolveRegionFilter(filters.locationRegion)] : [];
  const geographies = filters.geographies?.length ? filters.geographies : filters.geography ? [filters.geography] : [];
  const minimum = Number(filters.minimumPay || filters.salaryMin || 0);
  return jobs.filter(job => {
    const facets = job.facets ?? deriveJobFacets(job);
    const haystack = plainJobText(filters.searchScope === "title" ? job.title || job.og_title : [job.title, job.og_title, job.description, job.og_description, job.company_name, job.category, job.clearance].filter(Boolean).join(" ")).toLowerCase();
    if (!keywords.every(word => haystack.includes(word)) || excluded.some(word => haystack.includes(word))) return false;
    for (const [key, values] of Object.entries(filters.selections ?? {})) {
      // Ignore legacy preferences even before stored filters are restored.
      if (key === "workplace") continue;
      if (key === "employment" && values?.length) {
        if (!jobEmploymentTypes(job).some(v => values.includes(v))) return false;
        continue;
      }
      if (values?.length && !values.includes(facets[key as FacetKey])) return false;
    }
    const regions = jobRegions(job);
    const unspecified = isUnspecifiedJobLocation(regions);
    if (selectedRegions.length && !regions.some(r => selectedRegions.includes(r)) && !((selectedRegions.includes(JOB_LOCATION_UNSPECIFIED) || filters.includeUnknownLocation) && unspecified)) return false;
    if (geographies.length) {
      const conus = (r: string) => isUsStateAbbr(r) && r !== "AK" && r !== "HI";
      const matches = geographies.some(geography => geography === "conus" ? regions.some(conus) : regions.some(r => !conus(r) && r !== "United States"));
      if (!matches && !(filters.includeUnknownLocation && unspecified)) return false;
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
  const geographies = filters.geographies?.length ? filters.geographies : filters.geography ? [filters.geography] : [];
  for (const geography of geographies) chips.push({ label: geography.toUpperCase(), clear: { geography: "", geographies: geographies.filter(value => value !== geography) } });
  for (const [key, values] of Object.entries(filters.selections ?? {})) {
    if (key === "workplace") continue;
    for (const value of values ?? []) {
      chips.push({ label: (FACET_OPTIONS[key as FacetKey] as Record<string, string>)[value] ?? value, clear: { selections: { ...filters.selections, [key]: values.filter(v => v !== value) } } });
    }
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
