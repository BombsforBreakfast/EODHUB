// GDELT 2.0 DOC API discovery lane.
//
// Free, no API key, broad global + local coverage. Lower per-query precision
// than NewsAPI / Brave, which is fine — the relevance scorer + negative filter
// + admin approval queue downstream do the cleanup.
//
// Swap target: replace this file (or add a sibling) and switch the export in
// the runner. The NewsProvider interface is the contract.

import {
  DISCOVERY_QUERIES,
  DISCOVERY_TIMESPAN,
  DISCOVERY_MAX_RECORDS_PER_QUERY,
} from "../config/queries";
import { SATIRE_DOMAINS } from "../config/keywords";
import { normalizeCandidate } from "../normalize";
import type { NewsCandidate } from "../types";
import type { NewsProvider } from "./types";

const GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = "EODHubNewsBot/1.0 (+https://www.eod-hub.com)";

type GdeltArticle = {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string; // "YYYYMMDDTHHMMSSZ"
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

type GdeltResponse = {
  articles?: GdeltArticle[];
};

function parseGdeltDate(s: string | undefined): string | null {
  if (!s || s.length < 15) return null;
  // GDELT format: YYYYMMDDTHHMMSSZ
  const y = s.slice(0, 4);
  const mo = s.slice(4, 6);
  const d = s.slice(6, 8);
  const h = s.slice(9, 11);
  const mi = s.slice(11, 13);
  const se = s.slice(13, 15);
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}Z`;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

async function runQuery(query: string): Promise<NewsCandidate[]> {
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    format: "JSON",
    maxrecords: String(DISCOVERY_MAX_RECORDS_PER_QUERY),
    sort: "DateDesc",
    timespan: DISCOVERY_TIMESPAN,
  });
  const url = `${GDELT_BASE}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let json: GdeltResponse | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    // GDELT occasionally returns text/html when it has nothing; guard JSON parse.
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) return [];
    json = JSON.parse(text) as GdeltResponse;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }

  const articles = json?.articles ?? [];
  const out: NewsCandidate[] = [];
  for (const a of articles) {
    const link = a.url ?? a.url_mobile;
    if (!link || !a.title) continue;

    const host = (() => {
      try {
        return new URL(link).host.toLowerCase();
      } catch {
        return a.domain ?? null;
      }
    })();
    const isSatire = host ? SATIRE_DOMAINS.includes(host) : false;

    const candidate = normalizeCandidate({
      headline: a.title,
      source_url: link,
      summary: null,
      published_at: parseGdeltDate(a.seendate),
      thumbnail_url: a.socialimage ?? null,
      source_name: a.domain ?? host ?? null,
      is_satire: isSatire,
      // No curated weight for discovery results.
      source_weight: 0,
      raw: { provider: "gdelt", query, ...a } as Record<string, unknown>,
    });
    if (candidate) {
      candidate.matched_discovery_queries = [query];
      out.push(candidate);
    }
  }
  return out;
}

export async function fetchCandidatesFromDiscovery(): Promise<NewsCandidate[]> {
  const settled = await Promise.allSettled(DISCOVERY_QUERIES.map(runQuery));
  const out: NewsCandidate[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

export const discoveryProvider: NewsProvider = {
  id: "gdelt",
  fetchCandidates: fetchCandidatesFromDiscovery,
};
