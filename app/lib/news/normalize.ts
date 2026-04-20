// Normalization step: take raw provider output and produce a clean
// NewsCandidate. Consumed by both the RSS lane and the GDELT lane so all
// downstream code (scoring, dedupe, runner) can assume one shape.

import type { NewsCandidate } from "./types";

export type NormalizeInput = {
  headline: string;
  source_url: string;
  summary: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  source_name: string | null;
  is_satire: boolean;
  source_weight: number;
  raw: Record<string, unknown>;
};

const TRACKING_PARAM_PREFIXES = ["utm_", "mc_"];
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "ref",
  "ref_src",
  "ref_url",
  "igshid",
  "yclid",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
]);

export function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.host = u.host.toLowerCase();
    // Strip tracking params; preserve real ones.
    const keep: [string, string][] = [];
    for (const [k, v] of u.searchParams.entries()) {
      const lower = k.toLowerCase();
      if (TRACKING_PARAMS.has(lower)) continue;
      if (TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) continue;
      keep.push([k, v]);
    }
    // Rebuild deterministically (sorted) so two equivalent URLs hash identically.
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    u.search = "";
    for (const [k, v] of keep) u.searchParams.append(k, v);
    // Drop trailing slash on the path (but never collapse the root "/").
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/g, "");
    }
    return u.toString();
  } catch {
    return null;
  }
}

function sourceNameFromHost(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).host.toLowerCase().replace(/^www\./, "");
    if (!host) return null;
    // "www.armytimes.com" → "armytimes.com" → "Armytimes" feels worse than just
    // returning the bare host, which renders fine and is unambiguous.
    return host;
  } catch {
    return null;
  }
}

function cleanText(s: string | null, max = 600): string | null {
  if (!s) return null;
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/** Returns null when the input is unusable (no headline or no URL). */
export function normalizeCandidate(input: NormalizeInput): NewsCandidate | null {
  const headline = cleanText(input.headline, 300);
  if (!headline) return null;
  if (!input.source_url) return null;

  const canonical = canonicalizeUrl(input.source_url);
  const summary = cleanText(input.summary, 600);

  return {
    headline,
    source_name: input.source_name ?? sourceNameFromHost(input.source_url),
    source_url: input.source_url,
    canonical_url: canonical,
    summary,
    thumbnail_url: input.thumbnail_url,
    published_at: parseDate(input.published_at),
    tags: [],
    is_satire: input.is_satire,
    raw: input.raw,
    source_weight: input.source_weight,
  };
}
