/**
 * ReliefWeb Jobs API v2 client and normalization.
 * Relevance scoring lives in ./reliefweb/scoreReliefWebJob.ts
 * @see https://apidoc.reliefweb.int/
 */

export {
  RELIEFWEB_KEYWORD_BATCHES,
  HARD_EXCLUSION_TERMS,
} from "./reliefweb/relevanceConfig";

export {
  RELIEFWEB_MINE_ACTION_THEME_ID,
  RELIEFWEB_THEME_INTAKE_CHANNELS,
  RELIEFWEB_SOURCE_INTAKE_CHANNELS,
} from "./reliefweb/filterIntake";

import type { ReliefWebJobScore } from "./reliefweb/scoreReliefWebJob";

export {
  scoreReliefWebJob,
  shouldExcludeReliefWebJob,
  shouldIngestReliefWebJob,
  type ReliefWebJobScoreInput,
} from "./reliefweb/scoreReliefWebJob";
export type { ReliefWebJobScore } from "./reliefweb/scoreReliefWebJob";

export const RELIEFWEB_API_BASE = "https://api.reliefweb.int/v2/jobs";

export const RESULTS_PER_PAGE = 50;
export const MAX_PAGES_PER_BATCH = 2;
export const STALE_DAYS = 30;
export const LOOKBACK_DAYS = 90;

export type ReliefWebImportMetadata = {
  matched_queries: string[];
  source_url: string | null;
  deadline: string | null;
  posted_at: string | null;
  organization: string | null;
  countries: string[];
  themes: string[];
  career_categories: string[];
  relevance_confidence: "high" | "possible" | "low";
  relevance_reasons: string[];
  needs_review: boolean;
  suppressed: boolean;
  /** @deprecated legacy field from earlier scorer */
  matched_keywords?: string[];
  /** @deprecated legacy field from earlier scorer */
  strong_match?: boolean;
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
  themes: string[];
  careerCategories: string[];
  metadataText: string;
};

type ReliefWebNamedRef = { id?: number; name?: string; shortname?: string };
type ReliefWebJobFields = {
  title?: string;
  body?: string;
  url?: string;
  source?: ReliefWebNamedRef[];
  country?: ReliefWebNamedRef[];
  city?: ReliefWebNamedRef[];
  theme?: ReliefWebNamedRef[];
  career_category?: ReliefWebNamedRef[];
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

export function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("uxo") || t.includes("unexploded ordnance")) return "UXO";
  if (t.includes("uas") || t.includes("uav") || t.includes("unmanned aerial") || t.includes("drone"))
    return "UAS";
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

export function buildReliefWebMetadataText(parts: {
  organization: string;
  countries: string[];
  themes: string[];
  careerCategories: string[];
}): string {
  return [
    parts.organization,
    ...parts.countries,
    ...parts.themes,
    ...parts.careerCategories,
  ]
    .filter(Boolean)
    .join(" ");
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
  const themes = pickNames(f.theme);
  const careerCategories = pickNames(f.career_category);
  const organization = sources[0] ?? "";
  const locationParts = [...cities, ...countries].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : "International";

  const fieldsUrl = typeof f.url === "string" ? f.url : undefined;
  const applyUrl = buildReliefWebJobUrl(id, fieldsUrl);
  const metadataText = buildReliefWebMetadataText({
    organization,
    countries,
    themes,
    careerCategories,
  });

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
    themes,
    careerCategories,
    metadataText,
  };
}

/** ReliefWeb date filters require +00:00 offset, not Z suffix. */
export function formatReliefWebFilterDate(date: Date): string {
  return `${date.toISOString().slice(0, 10)}T00:00:00+00:00`;
}

export const RELIEFWEB_JOB_FIELD_INCLUDES = [
  "id",
  "title",
  "body",
  "url",
  "source.name",
  "source.shortname",
  "country.name",
  "city.name",
  "theme.name",
  "career_category.name",
  "date.created",
  "date.closing",
] as const;

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
      include: [...RELIEFWEB_JOB_FIELD_INCLUDES],
    },
  };
}

export function buildReliefWebThemeFilterBody(
  themeId: number,
  offset: number,
  createdAfterIso: string
): Record<string, unknown> {
  return {
    limit: RESULTS_PER_PAGE,
    offset,
    preset: "latest",
    filter: {
      operator: "AND",
      conditions: [
        { field: "theme", value: themeId },
        { field: "date.created", value: { from: createdAfterIso } },
      ],
    },
    fields: {
      include: [...RELIEFWEB_JOB_FIELD_INCLUDES],
    },
  };
}

export function buildReliefWebSourceQueryBody(
  queryValue: string,
  offset: number,
  createdAfterIso: string
): Record<string, unknown> {
  return {
    limit: RESULTS_PER_PAGE,
    offset,
    preset: "latest",
    query: {
      value: queryValue,
      fields: ["source"],
    },
    filter: {
      field: "date.created",
      value: { from: createdAfterIso },
    },
    fields: {
      include: [...RELIEFWEB_JOB_FIELD_INCLUDES],
    },
  };
}

async function postReliefWebJobs(
  body: Record<string, unknown>,
  appName: string
): Promise<{ jobs: ReliefWebApiJob[]; error?: string }> {
  const url = `${RELIEFWEB_API_BASE}?appname=${encodeURIComponent(appName)}`;

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

export async function fetchReliefWebJobsByTheme(
  themeId: number,
  offset: number,
  appName: string,
  createdAfterIso: string
): Promise<{ jobs: ReliefWebApiJob[]; error?: string }> {
  return postReliefWebJobs(buildReliefWebThemeFilterBody(themeId, offset, createdAfterIso), appName);
}

export async function fetchReliefWebJobsBySourceQuery(
  queryValue: string,
  offset: number,
  appName: string,
  createdAfterIso: string
): Promise<{ jobs: ReliefWebApiJob[]; error?: string }> {
  return postReliefWebJobs(buildReliefWebSourceQueryBody(queryValue, offset, createdAfterIso), appName);
}

export async function fetchReliefWebJobsByIds(
  jobIds: string[],
  appName: string
): Promise<{ jobs: ReliefWebApiJob[]; error?: string }> {
  const ids = [...new Set(jobIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { jobs: [] };

  const body = {
    limit: ids.length,
    filter: {
      operator: "OR",
      conditions: ids.map((id) => ({
        field: "id",
        value: Number.isFinite(Number(id)) ? Number(id) : id,
      })),
    },
    fields: {
      include: [...RELIEFWEB_JOB_FIELD_INCLUDES],
    },
  };

  return postReliefWebJobs(body, appName);
}

export async function fetchReliefWebJobsBatch(
  queryValue: string,
  offset: number,
  appName: string,
  createdAfterIso: string
): Promise<{ jobs: ReliefWebApiJob[]; error?: string }> {
  return postReliefWebJobs(buildReliefWebPostBody(queryValue, offset, createdAfterIso), appName);
}

export function buildImportMetadata(
  normalized: NormalizedReliefWebJob,
  score: ReliefWebJobScore,
  matchedQuery: string
): ReliefWebImportMetadata {
  return {
    matched_queries: [matchedQuery],
    source_url: normalized.sourceUrl,
    deadline: normalized.deadline,
    posted_at: normalized.postedAt,
    organization: normalized.organization,
    countries: normalized.countries,
    themes: normalized.themes,
    career_categories: normalized.careerCategories,
    relevance_confidence: score.confidence,
    relevance_reasons: score.reasons,
    needs_review: score.needsReview,
    suppressed: score.suppressed,
    strong_match: score.confidence === "high",
  };
}
