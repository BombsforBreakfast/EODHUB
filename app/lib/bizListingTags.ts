/**
 * Suggested directory tags (shown as quick-picks). Custom tags are stored per-browser in localStorage.
 */
export const BIZ_LISTING_SUGGESTED_TAGS: readonly string[] = [
  "24/7 support",
  "Active duty owned",
  "Active duty support",
  "Air Force",
  "Anonymous",
  "Army",
  "Career transition",
  "Caregiver support",
  "Chat support",
  "Community nonprofit",
  "Confidential",
  "Counseling",
  "Critical incident stress",
  "Crisis hotline",
  "Crisis support",
  "Deployment",
  "Disability / injury support",
  "Disabled veteran owned",
  "Education and training",
  "Family / spouse support",
  "Family support",
  "Federal",
  "Financial assistance",
  "Financial counseling",
  "First Responder",
  "Free services",
  "Government",
  "Grief / loss",
  "Housing",
  "Housing assistance",
  "In-person services",
  "Job placement",
  "LEO",
  "Legal assistance",
  "Line of duty trauma",
  "Low-cost services",
  "Mental health",
  "Military transition",
  "Nationwide",
  "Navy",
  "NG / Reserves",
  "Nonprofit",
  "Online services",
  "Peer counseling",
  "Peer support",
  "Phone support",
  "Private organization",
  "PTSD",
  "Reintegration",
  "Resilience",
  "Resource navigation",
  "Resume support",
  "Scholarships",
  "Space Force",
  "Spouse owned",
  "Substance abuse recovery",
  "Substance use recovery",
  "Suicide prevention",
  "TBI support",
  "Text support",
  "Trauma",
  "VA benefits",
  "Veteran owned",
  "Veteran support",
  "Wellness",
] as const;

const STORAGE_KEY = "eodhub.bizListing.customTagsV1";
const MAX_CUSTOM_REMEMBERED = 40;
const MAX_TAGS_PER_LISTING = 12;

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

export function normalizeBizTagsInput(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    const k = normalizeKey(t);
    if (seen.has(k)) continue;
    if (out.length >= MAX_TAGS_PER_LISTING) break;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function suggestedSet(): Set<string> {
  return new Set(BIZ_LISTING_SUGGESTED_TAGS.map((s) => normalizeKey(s)));
}

export function loadRememberedBizTags(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

function saveRememberedList(tags: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tags.slice(0, MAX_CUSTOM_REMEMBERED)));
  } catch {
    /* ignore */
  }
}

/**
 * When the user types a new tag, persist it for future sessions (if not a duplicate of a suggested tag).
 */
export function rememberCustomBizTag(tag: string) {
  const t = tag.trim();
  if (!t) return;
  if (suggestedSet().has(normalizeKey(t))) return;
  const current = loadRememberedBizTags();
  if (current.some((x) => normalizeKey(x) === normalizeKey(t))) return;
  const next = [t, ...current.filter((x) => normalizeKey(x) !== normalizeKey(t))];
  saveRememberedList(next);
}

export function allBizTagOptionsForPicker(): string[] {
  const suggested = [...BIZ_LISTING_SUGGESTED_TAGS];
  const remembered = loadRememberedBizTags();
  const seen = new Set(suggested.map((s) => normalizeKey(s)));
  const extra: string[] = [];
  for (const r of remembered) {
    if (!seen.has(normalizeKey(r))) {
      seen.add(normalizeKey(r));
      extra.push(r);
    }
  }
  extra.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...suggested, ...extra];
}

export function coerceTagsFromDb(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  return [];
}
