/**
 * ReliefWeb Jobs API v2 client, normalization, and EOD/HMA relevance scoring.
 * @see https://apidoc.reliefweb.int/
 */

export const RELIEFWEB_API_BASE = "https://api.reliefweb.int/v2/jobs";

export const RESULTS_PER_PAGE = 50;
export const MAX_PAGES_PER_BATCH = 2;
export const STALE_DAYS = 30;
export const LOOKBACK_DAYS = 60;

/** Batched OR queries to limit API calls (ReliefWeb daily quota: 1000 calls). */
export const RELIEFWEB_KEYWORD_BATCHES: string[] = [
  "explosive OR ordnance OR EOD OR UXO OR \"unexploded ordnance\"",
  "\"mine action\" OR \"humanitarian mine action\" OR HMA OR demining OR deminer",
  "clearance OR \"weapons contamination\" OR \"explosive ordnance risk education\" OR EORE OR \"risk education\"",
  "IED OR \"improvised explosive\" OR CBRN OR CBRNE OR WMD OR CWMD OR \"counter weapons of mass destruction\"",
  "ammunition OR munitions OR \"small arms\" OR \"light weapons\" OR SALW OR \"arms control\"",
  "\"standards and training\" OR \"training manager\" OR \"technical advisor\" OR \"operations manager\"",
  "\"quality assurance\" OR \"quality control\" OR \"land release\" OR \"battle area clearance\" OR BAC",
  "\"non-technical survey\" OR \"technical survey\" OR NTS OR \"explosive remnants of war\" OR ERW",
  "protection OR \"security risk\" OR \"safety and security\" OR stabilization OR peacebuilding OR conflict",
  "Syria OR Iraq OR Ukraine OR Afghanistan OR Somalia OR Yemen",
];

const HIGH_CONFIDENCE_TERMS = [
  "eod",
  "uxo",
  "unexploded ordnance",
  "explosive ordnance",
  "mine action",
  "humanitarian mine action",
  "demining",
  "deminer",
  "weapons contamination",
  "eore",
  "explosive ordnance risk education",
  "erw",
  "explosive remnants of war",
  "ied",
  "improvised explosive",
  "cbrn",
  "cbrne",
  "wmd",
  "cwmd",
  "counter weapons of mass destruction",
  "battle area clearance",
  "land release",
];

const MEDIUM_CONFIDENCE_TERMS = [
  "ammunition",
  "munitions",
  "arms control",
  "small arms",
  "salw",
  "light weapons",
  "standards and training",
  "technical advisor",
  "operations manager",
  "quality assurance",
  "quality control",
  "technical survey",
  "non-technical survey",
  "nts",
  "bac",
  "hma",
  "clearance",
];

const LOW_CONFIDENCE_TERMS = [
  "protection",
  "security",
  "stabilization",
  "peacebuilding",
  "conflict",
  "training manager",
  "safety",
  "syria",
  "iraq",
  "ukraine",
  "afghanistan",
  "somalia",
  "yemen",
];

const KNOWN_ORGS = [
  "halo trust",
  "halo",
  "mines advisory group",
  "mag",
  "danish refugee council",
  "drc",
  "norwegian people's aid",
  "npa",
  "humanity & inclusion",
  "humanity and inclusion",
  "unmas",
  "gichd",
  "geneva international centre for humanitarian demining",
  "tetra tech",
  "janus global",
  "fsd",
  "apopo",
  "spirit of soccer",
  "ddg",
  "danish demining group",
  "icrc",
];

export const SCORE_STRONG_MATCH = 15;
export const SCORE_INGEST_MIN = 8;

export type ReliefWebImportMetadata = {
  matched_keywords: string[];
  matched_queries: string[];
  strong_match: boolean;
  source_url: string | null;
  deadline: string | null;
  posted_at: string | null;
  organization: string | null;
  countries: string[];
};

export type NormalizedReliefWebJob = {
  reliefwebJobId: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  applyUrl: string;
  sourceUrl: string;
  postedAt: string | null;
  deadline: string | null;
  countries: string[];
  organization: string;
};

type ReliefWebNamedRef = { id?: number; name?: string; shortname?: string };
type ReliefWebJobFields = {
  title?: string;
  body?: string;
  url?: string;
  source?: ReliefWebNamedRef[];
  country?: ReliefWebNamedRef[];
  city?: ReliefWebNamedRef[];
  date?: {
    created?: string;
    closing?: string;
  };
};

export type ReliefWebApiJob = {
  id: number | string;
  href?: string;
  fields?: ReliefWebJobFields;
};

export type ReliefWebApiResponse = {
  data?: ReliefWebApiJob[];
  totalCount?: number;
  links?: { next?: string };
};

export type RelevanceResult = {
  score: number;
  matchedKeywords: string[];
  strongMatch: boolean;
};

function termMatches(text: string, term: string): boolean {
  const t = term.toLowerCase();
  if (t.length <= 3 && !t.includes(" ")) {
    return new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(text);
  }
  return text.includes(t);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTermMatches(
  text: string,
  terms: string[],
  weight: number,
  label: string,
  matched: Set<string>
): number {
  let points = 0;
  const lower = text.toLowerCase();
  for (const term of terms) {
    if (termMatches(lower, term)) {
      const key = `${label}:${term}`;
      if (!matched.has(key)) {
        matched.add(key);
        points += weight;
      }
    }
  }
  return points;
}

export function scoreReliefWebRelevance(
  title: string,
  body: string,
  orgName: string
): RelevanceResult {
  const matched = new Set<string>();
  const combined = `${title}\n${body}\n${orgName}`;
  const titleLower = title.toLowerCase();
  const orgLower = orgName.toLowerCase();

  let score = 0;
  score += collectTermMatches(combined, HIGH_CONFIDENCE_TERMS, 10, "high", matched);
  score += collectTermMatches(combined, MEDIUM_CONFIDENCE_TERMS, 5, "med", matched);
  score += collectTermMatches(combined, LOW_CONFIDENCE_TERMS, 2, "low", matched);

  for (const term of HIGH_CONFIDENCE_TERMS) {
    if (termMatches(titleLower, term)) {
      score += 5;
      matched.add(`title:${term}`);
      break;
    }
  }

  for (const org of KNOWN_ORGS) {
    if (orgLower.includes(org)) {
      score += 3;
      matched.add(`org:${org}`);
      break;
    }
  }

  const matchedKeywords = [...matched].map((k) => k.split(":").slice(1).join(":"));

  return {
    score,
    matchedKeywords,
    strongMatch: score >= SCORE_STRONG_MATCH,
  };
}

export function hasHighConfidenceTerm(title: string, body: string): boolean {
  const text = `${title}\n${body}`.toLowerCase();
  return HIGH_CONFIDENCE_TERMS.some((term) => termMatches(text, term));
}

export function shouldIngestReliefWebJob(
  score: number,
  title: string,
  body: string
): boolean {
  if (score >= SCORE_INGEST_MIN) return true;
  if (score < SCORE_INGEST_MIN && hasHighConfidenceTerm(title, body)) return true;
  return false;
}

export function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("uxo") || t.includes("unexploded ordnance")) return "UXO";
  if (t.includes("bomb squad") || t.includes("bomb tech")) return "Bomb Squad";
  if (t.includes("demining") || t.includes("mine action") || t.includes("hma"))
    return "HMA";
  if (t.includes("cbrn") || t.includes("cbrne") || t.includes("wmd")) return "CBRN";
  return "EOD";
}

function pickNames(refs: ReliefWebNamedRef[] | undefined): string[] {
  if (!refs?.length) return [];
  return refs
    .map((r) => r.name || r.shortname || "")
    .filter(Boolean);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildReliefWebJobUrl(jobId: string | number, fieldsUrl?: string): string {
  if (fieldsUrl && /^https?:\/\//i.test(fieldsUrl)) return fieldsUrl;
  return `https://reliefweb.int/job/${jobId}`;
}

export function normalizeReliefWebJob(raw: ReliefWebApiJob): NormalizedReliefWebJob | null {
  const id = raw.id != null ? String(raw.id) : "";
  if (!id) return null;

  const f = raw.fields ?? {};
  const title = (f.title ?? "").trim();
  if (!title) return null;

  const bodyRaw = (f.body ?? "").trim();
  const description = bodyRaw ? stripHtml(bodyRaw).slice(0, 12000) : "";

  const sources = pickNames(f.source);
  const countries = pickNames(f.country);
  const cities = pickNames(f.city);
  const organization = sources[0] ?? "";
  const locationParts = [...cities, ...countries].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : "International";

  const fieldsUrl = typeof f.url === "string" ? f.url : undefined;
  const applyUrl = buildReliefWebJobUrl(id, fieldsUrl);

  return {
    reliefwebJobId: id,
    title,
    companyName: organization || "Humanitarian Organization",
    location,
    description,
    applyUrl,
    sourceUrl: applyUrl,
    postedAt: f.date?.created ?? null,
    deadline: f.date?.closing ?? null,
    countries,
    organization,
  };
}

export function buildReliefWebPostBody(
  queryValue: string,
  offset: number,
  createdAfterIso: string
): Record<string, unknown> {
  return {
    limit: RESULTS_PER_PAGE,
    offset,
    query: {
      value: queryValue,
      fields: ["title", "body"],
    },
    filter: {
      field: "date.created",
      value: { from: createdAfterIso },
    },
    fields: {
      include: [
        "id",
        "title",
        "body",
        "url",
        "source.name",
        "source.shortname",
        "country.name",
        "city.name",
        "date.created",
        "date.closing",
      ],
    },
  };
}

export async function fetchReliefWebJobsBatch(
  queryValue: string,
  offset: number,
  appName: string,
  createdAfterIso: string
): Promise<{ jobs: ReliefWebApiJob[]; error?: string }> {
  const url = `${RELIEFWEB_API_BASE}?appname=${encodeURIComponent(appName)}`;
  const body = buildReliefWebPostBody(queryValue, offset, createdAfterIso);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { jobs: [], error: `${res.status}: ${text.slice(0, 500)}` };
    }

    const data = (await res.json()) as ReliefWebApiResponse;
    return { jobs: data.data ?? [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { jobs: [], error: msg };
  }
}

export function buildImportMetadata(
  normalized: NormalizedReliefWebJob,
  relevance: RelevanceResult,
  matchedQuery: string
): ReliefWebImportMetadata {
  return {
    matched_keywords: relevance.matchedKeywords,
    matched_queries: [matchedQuery],
    strong_match: relevance.strongMatch,
    source_url: normalized.sourceUrl,
    deadline: normalized.deadline,
    posted_at: normalized.postedAt,
    organization: normalized.organization,
    countries: normalized.countries,
  };
}
