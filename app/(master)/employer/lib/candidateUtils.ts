import type { PublicCandidate } from "./types";

/** Accept string[] or comma-string (profiles has both patterns). */
export function toTagArray(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function candidateDisplayName(c: PublicCandidate): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return c.display_name?.trim() || full || "EOD Professional";
}

export function candidateInitial(c: PublicCandidate): string {
  return (
    c.first_name?.[0] ||
    c.display_name?.[0] ||
    "?"
  ).toUpperCase();
}

export function candidateLocation(c: PublicCandidate): string {
  return [c.current_city, c.current_state].filter(Boolean).join(", ");
}

export function candidateAllTags(c: PublicCandidate): string[] {
  return Array.from(
    new Set([
      ...toTagArray(c.professional_tags),
      ...toTagArray(c.unit_history_tags),
      ...toTagArray(c.tech_types),
    ]),
  );
}

/**
 * Client-side search/filter. Kept pure so it's easy to reason about.
 * Matches across username, display_name, bio, tags, service/branch, role,
 * location, and (when present) resume_text.
 */
export type CandidateFilters = {
  search: string;
  service: string;
  yearsExperience: string;
  location: string;
  tag: string;
  clearance: string;
};

export const EMPTY_FILTERS: CandidateFilters = {
  search: "",
  service: "",
  yearsExperience: "",
  location: "",
  tag: "",
  clearance: "",
};

export function candidateMatchesFilters<T extends PublicCandidate & {
  resume_text?: string | null;
  clearance_level?: string | null;
}>(c: T, filters: CandidateFilters): boolean {
  const q = filters.search.trim().toLowerCase();
  if (q) {
    const hay = [
      c.display_name,
      c.first_name,
      c.last_name,
      c.bio,
      c.role,
      c.service,
      c.status,
      c.years_experience,
      c.current_city,
      c.current_state,
      candidateAllTags(c).join(" "),
      c.resume_text ?? "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (filters.service) {
    if ((c.service ?? "").toLowerCase() !== filters.service.toLowerCase()) {
      return false;
    }
  }

  if (filters.yearsExperience) {
    if ((c.years_experience ?? "").toLowerCase() !== filters.yearsExperience.toLowerCase()) {
      return false;
    }
  }

  if (filters.location) {
    const loc = filters.location.trim().toLowerCase();
    const candidateLoc = [c.current_city, c.current_state, c.role, c.service]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!candidateLoc.includes(loc)) return false;
  }

  if (filters.tag) {
    const tag = filters.tag.toLowerCase();
    const tags = candidateAllTags(c).map((t) => t.toLowerCase());
    if (!tags.includes(tag)) return false;
  }

  if (filters.clearance) {
    if ((c.clearance_level ?? "").toLowerCase() !== filters.clearance.toLowerCase()) {
      return false;
    }
  }

  return true;
}

/**
 * Build unique option lists from loaded candidate rows. We only surface
 * filter values that actually exist in the current pool — prevents empty
 * dropdowns on small data sets.
 */
export function collectFilterOptions(candidates: PublicCandidate[]) {
  const services = new Set<string>();
  const years = new Set<string>();
  const tags = new Set<string>();
  for (const c of candidates) {
    if (c.service) services.add(c.service);
    if (c.years_experience) years.add(c.years_experience);
    for (const tag of candidateAllTags(c)) tags.add(tag);
  }
  return {
    services: Array.from(services).sort(),
    years: Array.from(years).sort(),
    tags: Array.from(tags).sort(),
  };
}
