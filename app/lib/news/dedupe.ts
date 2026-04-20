// Deduplication helpers.
//
// Two layers:
//   1. In-batch dedupe — multiple sources covering the same event in a single
//      run collapse to one row (keeping the highest source_weight).
//   2. Recent-window dedupe — query news_items for matching dedupe_key OR
//      headline_key in the last N days; drop anything we've already seen.
//
// dedupe_key is the canonical URL hash when available, else hash of host +
// normalized headline. headline_key is a separate normalized form used for
// fuzzy matching across providers that link to different aggregator URLs.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsCandidate } from "./types";

const DEFAULT_WINDOW_DAYS = 14;

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

export function headlineKey(headline: string): string {
  const cleaned = headline
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Take the first 12 tokens — enough to disambiguate, short enough that
  // wire-service rewrites still match.
  return cleaned.split(" ").slice(0, 12).join(" ");
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function computeDedupeKey(c: NewsCandidate): string {
  const url = c.canonical_url ?? c.source_url;
  if (url) return sha1(url);
  const host = hostOf(c.source_url) ?? "unknown";
  return sha1(`${host}::${headlineKey(c.headline)}`);
}

/**
 * Decorates each candidate with `dedupe_key` and `headline_key`, then collapses
 * in-batch duplicates by keeping the highest-weight (or, on tie, highest-score)
 * candidate per key. Stable: input order is preserved across distinct keys.
 */
export function decorateAndCollapseInBatch(candidates: NewsCandidate[]): NewsCandidate[] {
  const byKey = new Map<string, NewsCandidate>();
  for (const c of candidates) {
    c.dedupe_key = computeDedupeKey(c);
    c.headline_key = headlineKey(c.headline);

    // We use BOTH keys to collapse: same dedupe_key clearly dups; same headline
    // key from different sources is the cross-provider case.
    const composite = `${c.headline_key}`; // headline-only key handles cross-provider
    const dupKey = c.dedupe_key;

    const existingByDup = byKey.get(`d:${dupKey}`);
    const existingByHeadline = byKey.get(`h:${composite}`);
    const existing = existingByDup ?? existingByHeadline;

    if (!existing) {
      byKey.set(`d:${dupKey}`, c);
      byKey.set(`h:${composite}`, c);
      continue;
    }

    const challengerWeight = (c.source_weight ?? 0) + (c.relevance_score ?? 0) * 0.01;
    const existingWeight = (existing.source_weight ?? 0) + (existing.relevance_score ?? 0) * 0.01;
    if (challengerWeight > existingWeight) {
      // Replace pointers so both keys land on the better candidate.
      byKey.set(`d:${dupKey}`, c);
      byKey.set(`h:${composite}`, c);
      // Wipe the loser's `d:` entry too if it was different.
      if (existing.dedupe_key && existing.dedupe_key !== dupKey) {
        byKey.set(`d:${existing.dedupe_key}`, c);
      }
    }
  }

  // De-duplicate the values (each survivor was stored under at least 2 keys).
  const seen = new Set<NewsCandidate>();
  const out: NewsCandidate[] = [];
  for (const v of byKey.values()) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Strips candidates that already exist in news_items within the recent window.
 * Matches on dedupe_key OR headline_key; either is enough.
 */
export async function filterAgainstRecent(
  candidates: NewsCandidate[],
  supabase: SupabaseClient,
  windowDays: number = DEFAULT_WINDOW_DAYS
): Promise<{ keep: NewsCandidate[]; droppedDuplicates: number }> {
  if (candidates.length === 0) return { keep: [], droppedDuplicates: 0 };

  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const dedupeKeys = candidates.map((c) => c.dedupe_key!).filter(Boolean);

  const { data, error } = await supabase
    .from("news_items")
    .select("dedupe_key, headline")
    .gte("created_at", sinceIso)
    .in("dedupe_key", dedupeKeys.length > 0 ? dedupeKeys : ["__none__"]);

  // If we couldn't query, be conservative: keep nothing rather than risk
  // duplicate floods. Caller will see this in stats.errors via the runner.
  if (error) return { keep: [], droppedDuplicates: candidates.length };

  const recentDedupe = new Set<string>();
  const recentHeadline = new Set<string>();
  for (const row of (data ?? []) as Array<{ dedupe_key: string; headline: string }>) {
    recentDedupe.add(row.dedupe_key);
    recentHeadline.add(headlineKey(row.headline));
  }

  // Second query for headline-only matches the dedupe_key set missed.
  // (Cheap follow-up; avoids OR filter complications in PostgREST.)
  const headlineKeys = candidates.map((c) => c.headline_key!).filter(Boolean);
  if (headlineKeys.length > 0) {
    const { data: data2 } = await supabase
      .from("news_items")
      .select("headline")
      .gte("created_at", sinceIso)
      .limit(500);
    for (const row of (data2 ?? []) as Array<{ headline: string }>) {
      recentHeadline.add(headlineKey(row.headline));
    }
  }

  const keep: NewsCandidate[] = [];
  let dropped = 0;
  for (const c of candidates) {
    if (recentDedupe.has(c.dedupe_key!) || recentHeadline.has(c.headline_key!)) {
      dropped += 1;
      continue;
    }
    keep.push(c);
  }
  return { keep, droppedDuplicates: dropped };
}
