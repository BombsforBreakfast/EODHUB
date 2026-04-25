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
  user_id?: string | null;
  anonymous?: boolean | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

export type SalaryMin = 25000 | 50000 | 75000 | 100000 | 125000 | 150000;

export type JobFilterState = {
  keyword: string;
  locationRegion: string;
  salaryMin: SalaryMin | "";
};

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

// Phrases that mean "this segment is just the country suffix for a US address".
const US_SUFFIXES = new Set(["united states", "usa", "us", "u.s.", "u.s.a."]);

// OCONUS regions always shown in the dropdown regardless of current job data.
const OCONUS_REGIONS: string[] = [
  "Canada", "Guam", "Italy", "Kuwait", "Philippines",
  "Puerto Rico", "Saudi Arabia", "Spain", "UAE",
];

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

    // Anything else is treated as a country / territory name.
    return part;
  }

  return null;
}

/**
 * Build the sorted list of unique regions for the location dropdown.
 * Always includes the hardcoded OCONUS list; dynamically adds any new
 * region extracted from the live job data (so new postings auto-appear).
 */
export function uniqueJobRegions(jobs: JobListItem[]): string[] {
  const regions = new Set<string>(OCONUS_REGIONS);
  for (const job of jobs) {
    const region = extractRegion(job.location);
    if (region && region !== "Remote") regions.add(region);
  }
  return [...regions].sort((a, b) => a.localeCompare(b));
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

function toLower(v: string | null | undefined): string {
  return (v ?? "").toLowerCase();
}

export function applyJobFilters(jobs: JobListItem[], filters: JobFilterState): JobListItem[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const region = filters.locationRegion;
  const salaryMin = filters.salaryMin;

  return jobs.filter((job) => {
    // Region filter — match against the extracted region label.
    if (region) {
      const jobRegion = extractRegion(job.location);
      if (jobRegion !== region) return false;
    }

    // Keyword filter.
    if (keyword) {
      const haystack = [
        job.title,
        job.category,
        job.description,
        job.company_name,
        job.clearance,
        job.og_title,
        job.og_description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    // Salary filter — job qualifies if either end of its range meets the minimum.
    if (salaryMin !== "") {
      const qualifies =
        (job.pay_max !== null && job.pay_max >= salaryMin) ||
        (job.pay_min !== null && job.pay_min >= salaryMin);
      if (!qualifies) return false;
    }

    return true;
  });
}

/** @deprecated use uniqueJobRegions instead */
export function uniqueJobLocations(jobs: JobListItem[]): string[] {
  return [...new Set(jobs.map((j) => (j.location ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
