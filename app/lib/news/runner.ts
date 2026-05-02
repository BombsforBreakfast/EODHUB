// Ingestion orchestrator. One entry point — `runNewsIngestion(supabase)` —
// callable from the cron route or an admin button.
//
// Pipeline:
//   feeds + discovery → normalize → score → threshold filter → in-batch dedupe
//   → recent-window dedupe → cap → insert (status: 'pending', awaiting admin)
//
// Idempotent: unique dedupe_key + on-conflict-do-nothing means overlapping
// hourly runs are safe.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseClient as SupaClient } from "@supabase/supabase-js";

import { feedsProvider } from "./providers/feeds";
import { discoveryProvider } from "./providers/discovery";
import {
  scoreCandidate,
  passesThreshold,
  analyzeCandidate,
  buildNewsIntakeDebug,
  type ScoreBreakdown,
  type NewsIntakeDebug,
} from "./scoring";
import { computeDedupeKey, decorateAndCollapseInBatch, filterAgainstRecent, headlineKey } from "./dedupe";
import { fetchBodiesConcurrent } from "./fetchBody";
import type { IngestionStats, NewsCandidate } from "./types";

export type PreviewCandidate = {
  headline: string;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  is_satire: boolean;
  source_weight: number;
  dedupe_key: string;
  breakdown: ScoreBreakdown;
  /** Discovery query or feed lane provenance + matched vocabulary (mirrors DB `raw_payload.intake_debug`). */
  intake_debug?: NewsIntakeDebug;
  /** True if the runner pulled the article body and re-scored against it. */
  enriched_from_body: boolean;
  /** Score from headline+snippet only, before the body fetch ran (if it ran). */
  score_before_body: number | null;
  /** True if this dedupe_key already exists in news_items (any status). */
  alreadyInDb: boolean;
  /** Final disposition the runner WOULD apply right now. */
  status:
    | "would_insert"
    | "below_threshold"
    | "no_positive_hits"
    | "negative_in_title"
    | "duplicate_in_db"
    | "duplicate_in_batch";
};

/** Per GDELT query string (or `feed:Name`) — how many raw rows and how each disposition landed. */
export type NewsQueryLaneStat = {
  lane: string;
  fetched: number;
  would_insert: number;
  below_threshold: number;
  no_positive_hits: number;
  negative_in_title: number;
  duplicate_in_db: number;
  duplicate_in_batch: number;
};

export type PreviewResult = {
  totalFetched: number;
  /** How many of the fetched candidates were filtered out by the admin blocklist. */
  blockedCount: number;
  byStatus: Record<PreviewCandidate["status"], number>;
  candidates: PreviewCandidate[];
  /** Which discovery queries / feed lanes produced useful vs noisy rows in this scan. */
  queryLaneStats: NewsQueryLaneStat[];
};

const MAX_PER_RUN = 5;
const MAX_PER_DAY = 10;
const RECENT_DUP_WINDOW_DAYS = 14;

// Body-fetch enrichment knobs. We only second-pass items whose title+snippet
// scored too low to pass, AND that look "worth the network round-trip" — i.e.
// either from a high-weight curated source or already showing some military/LE
// framing. This keeps fetches focused (Army Times piece whose body says
// "Explosive Ordnance Disposal at Fort Campbell" gets caught) while skipping
// obvious noise like sports/biz metaphor hits.
const MAX_BODY_FETCHES_PER_RUN = 30;
const BODY_FETCH_CONCURRENCY = 5;
const SOURCE_WEIGHT_FOR_BODY_FETCH = 3;

function laneKeysForCandidate(c: NewsCandidate): string[] {
  if (c.matched_discovery_queries && c.matched_discovery_queries.length > 0) {
    return c.matched_discovery_queries;
  }
  const r = c.raw;
  if (r && r.provider === "feeds" && typeof r.feed === "string") {
    return [`feed:${r.feed}`];
  }
  if (r && r.provider === "feeds") {
    return [`feed:${c.source_name ?? "rss"}`];
  }
  return ["(unknown lane)"];
}

function bumpLaneStat(
  map: Map<string, NewsQueryLaneStat>,
  lanes: string[],
  status: PreviewCandidate["status"]
) {
  for (const lane of lanes) {
    let row = map.get(lane);
    if (!row) {
      row = {
        lane,
        fetched: 0,
        would_insert: 0,
        below_threshold: 0,
        no_positive_hits: 0,
        negative_in_title: 0,
        duplicate_in_db: 0,
        duplicate_in_batch: 0,
      };
      map.set(lane, row);
    }
    row.fetched += 1;
    if (status === "would_insert") row.would_insert += 1;
    else if (status === "below_threshold") row.below_threshold += 1;
    else if (status === "no_positive_hits") row.no_positive_hits += 1;
    else if (status === "negative_in_title") row.negative_in_title += 1;
    else if (status === "duplicate_in_db") row.duplicate_in_db += 1;
    else if (status === "duplicate_in_batch") row.duplicate_in_batch += 1;
  }
}

async function loadBlockedDedupeKeys(supabase: SupaClient): Promise<Set<string>> {
  const blocked = new Set<string>();
  // Pulling the full blocklist is fine — even at 10k entries it's ~few hundred KB
  // and runs once per ingestion. If it ever grows past that we can switch to a
  // bloom filter or per-batch `.in()` lookup.
  const { data } = await supabase
    .from("news_blocked_dedupe_keys")
    .select("dedupe_key")
    .limit(10_000);
  for (const row of (data ?? []) as Array<{ dedupe_key: string }>) {
    blocked.add(row.dedupe_key);
  }
  return blocked;
}

async function filterBlocked(
  candidates: NewsCandidate[],
  supabase: SupaClient
): Promise<NewsCandidate[]> {
  if (candidates.length === 0) return candidates;
  const blocked = await loadBlockedDedupeKeys(supabase);
  if (blocked.size === 0) return candidates;
  return candidates.filter((c) => {
    const key = c.dedupe_key ?? computeDedupeKey(c);
    return !blocked.has(key);
  });
}

function isWorthBodyFetch(c: NewsCandidate): boolean {
  // Already passing → no need to spend a fetch.
  if (passesThreshold(c, c.relevance_score ?? 0)) return false;
  // Re-derive analysis. analyzeCandidate is idempotent (only mutates is_satire,
  // which is a one-way flip).
  const a = analyzeCandidate(c);
  // Don't burn a fetch on items the negative-phrase filter already flagged as
  // metaphor noise — the body won't redeem them, and re-scoring would just
  // re-trip the same penalty.
  if (a.negativeIn === "title") return false;
  if ((c.source_weight ?? 0) >= SOURCE_WEIGHT_FOR_BODY_FETCH) return true;
  if (a.hasContext) return true;
  return false;
}

/**
 * Fetch article bodies for borderline candidates (capped, concurrent), append
 * the body text to `summary`, and re-score. Mutates candidates in place.
 *
 * Returns counts the runner needs for stats. Safe on failure: any fetch that
 * 4xx/5xxs / times out / returns non-HTML simply leaves the candidate's
 * existing score intact.
 */
async function enrichBorderlineWithBody(
  candidates: NewsCandidate[],
  max: number
): Promise<{ fetched: number; rescuedToPass: number }> {
  const targets = candidates.filter(isWorthBodyFetch).slice(0, max);
  if (targets.length === 0) return { fetched: 0, rescuedToPass: 0 };

  await fetchBodiesConcurrent(
    targets,
    (c) => c.source_url,
    (c, body) => {
      if (!body) return;
      c.score_before_body = c.relevance_score;
      // Cap merged text so downstream regex doesn't churn on huge pages.
      const merged = [c.summary ?? "", body].filter(Boolean).join(" ").slice(0, 12_000);
      c.summary = merged;
      c.relevance_score = scoreCandidate(c);
      c.enriched_from_body = true;
    },
    BODY_FETCH_CONCURRENCY
  );

  const rescuedToPass = targets.filter(
    (c) => c.enriched_from_body && passesThreshold(c, c.relevance_score ?? 0)
  ).length;
  return { fetched: targets.length, rescuedToPass };
}

export async function runNewsIngestion(supabase: SupabaseClient): Promise<IngestionStats> {
  const stats: IngestionStats = {
    fetched: 0,
    scored: 0,
    belowThreshold: 0,
    duplicates: 0,
    inserted: 0,
    capped: 0,
    bodyFetched: 0,
    bodyEnrichedPasses: 0,
    errors: [],
  };

  // 1. Fetch from both lanes in parallel.
  let candidates: NewsCandidate[] = [];
  try {
    const [feedItems, discoveryItems] = await Promise.all([
      feedsProvider.fetchCandidates().catch((e) => {
        stats.errors.push(`feeds: ${(e as Error).message}`);
        return [];
      }),
      discoveryProvider.fetchCandidates().catch((e) => {
        stats.errors.push(`discovery: ${(e as Error).message}`);
        return [];
      }),
    ]);
    candidates = [...feedItems, ...discoveryItems];
  } catch (err) {
    stats.errors.push(`fetch: ${(err as Error).message}`);
    return stats;
  }
  stats.fetched = candidates.length;

  // 1b. Apply persistent admin blocklist. Anything we've previously dismissed
  //     from the preview never re-enters the pipeline. Saves body fetches +
  //     scoring cycles on known-junk dedupe keys.
  candidates = await filterBlocked(candidates, supabase);

  // 2a. First-pass score against headline + snippet only (cheap).
  for (const c of candidates) {
    c.relevance_score = scoreCandidate(c);
  }

  // 2b. Body-fetch enrichment for borderline candidates. Catches stories like
  //     "Officer pleads guilty in smuggling case" whose headline omits the EOD
  //     signal but whose body says "...Army's Explosive Ordnance Disposal at
  //     Fort Campbell". Mutates `relevance_score` in place when a body lands.
  try {
    const enrichStats = await enrichBorderlineWithBody(candidates, MAX_BODY_FETCHES_PER_RUN);
    stats.bodyFetched = enrichStats.fetched;
    stats.bodyEnrichedPasses = enrichStats.rescuedToPass;
  } catch (err) {
    stats.errors.push(`body-fetch: ${(err as Error).message}`);
  }

  // 2c. Final threshold filter, now with enriched scores.
  const scored: NewsCandidate[] = [];
  for (const c of candidates) {
    if (passesThreshold(c, c.relevance_score ?? 0)) {
      scored.push(c);
    } else {
      stats.belowThreshold += 1;
    }
  }
  stats.scored = scored.length;

  // 3. In-batch dedupe (keeps highest-weight survivor per story).
  const collapsed = decorateAndCollapseInBatch(scored);
  stats.duplicates += scored.length - collapsed.length;

  // 4. Recent-window dedupe against DB.
  const { keep, droppedDuplicates } = await filterAgainstRecent(
    collapsed,
    supabase,
    RECENT_DUP_WINDOW_DAYS
  );
  stats.duplicates += droppedDuplicates;

  // 5. Sort survivors by score desc → highest signal first.
  keep.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

  // 6. Daily cap. We count today's PENDING + PUBLISHED inserts, not rejected.
  const startOfDayIso = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
  const { count: insertedToday } = await supabase
    .from("news_items")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDayIso)
    .neq("status", "rejected");
  const remainingTodayBudget = Math.max(0, MAX_PER_DAY - (insertedToday ?? 0));
  const perRunBudget = Math.min(MAX_PER_RUN, remainingTodayBudget);

  const toInsert = keep.slice(0, perRunBudget);
  stats.capped = keep.length - toInsert.length;

  // 7. Insert. Pending status, awaiting admin approval.
  if (toInsert.length > 0) {
    const rows = toInsert.map((c) => {
      const breakdown = analyzeCandidate(c);
      c.relevance_score = breakdown.score;
      const intake = buildNewsIntakeDebug(c, breakdown);
      return {
        headline: c.headline,
        source_name: c.source_name,
        source_url: c.source_url,
        canonical_url: c.canonical_url,
        summary: c.summary,
        thumbnail_url: c.thumbnail_url,
        published_at: c.published_at,
        tags: c.tags,
        relevance_score: breakdown.score,
        dedupe_key: c.dedupe_key!,
        raw_payload: { ...c.raw, intake_debug: intake } as Record<string, unknown>,
        content_type: "news",
        is_satire: c.is_satire,
        status: "pending" as const,
      };
    });

    // ON CONFLICT DO NOTHING via upsert + ignoreDuplicates. Two parallel cron
    // runs racing on the same dedupe_key are safe.
    const { data, error } = await supabase
      .from("news_items")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      stats.errors.push(`insert: ${error.message}`);
    } else {
      stats.inserted = data?.length ?? 0;
    }
  }

  return stats;
}

/**
 * Read-only diagnostic: fetch + score + check DB for duplicates, but DO NOT
 * insert anything. Returns every candidate the pipeline saw with the reason it
 * would (or would not) make it into the pending queue.
 *
 * Used by the admin Preview button to tune scoring rules against real output.
 */
export async function previewNewsIngestion(supabase: SupaClient): Promise<PreviewResult> {
  const [feedItems, discoveryItems] = await Promise.all([
    feedsProvider.fetchCandidates().catch(() => [] as NewsCandidate[]),
    discoveryProvider.fetchCandidates().catch(() => [] as NewsCandidate[]),
  ]);
  const rawFetched = [...feedItems, ...discoveryItems];

  // Compute dedupe keys early so we can apply the admin blocklist before
  // wasting any body fetches on items we've already dismissed.
  for (const c of rawFetched) {
    c.dedupe_key = computeDedupeKey(c);
    c.headline_key = headlineKey(c.headline);
  }
  const fetched = await filterBlocked(rawFetched, supabase);
  for (const c of fetched) {
    c.relevance_score = scoreCandidate(c);
  }

  // Apply the SAME body-fetch enrichment the runner does, so the preview
  // reflects what the cron would actually decide (not just the cheap pass).
  await enrichBorderlineWithBody(fetched, MAX_BODY_FETCHES_PER_RUN).catch(() => ({ fetched: 0, rescuedToPass: 0 }));

  // One bulk DB lookup for "has this dedupe_key been seen ever (any status)".
  const dedupeKeys = Array.from(new Set(fetched.map((c) => c.dedupe_key!).filter(Boolean)));
  const seenInDb = new Set<string>();
  if (dedupeKeys.length > 0) {
    // PostgREST caps `in` filter to ~1000 keys; chunk to be safe.
    const chunkSize = 200;
    for (let i = 0; i < dedupeKeys.length; i += chunkSize) {
      const slice = dedupeKeys.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("news_items")
        .select("dedupe_key")
        .in("dedupe_key", slice);
      for (const row of (data ?? []) as Array<{ dedupe_key: string }>) {
        seenInDb.add(row.dedupe_key);
      }
    }
  }

  // Build per-candidate analysis. Track in-batch duplicates so the user knows
  // which key is winning when two providers cover the same story.
  const seenInBatch = new Set<string>();
  const candidates: PreviewCandidate[] = [];
  const queryLaneStatsMap = new Map<string, NewsQueryLaneStat>();
  for (const c of fetched) {
    const breakdown = analyzeCandidate(c);
    let status: PreviewCandidate["status"];
    const dupInBatch = seenInBatch.has(c.dedupe_key!);
    if (!dupInBatch) seenInBatch.add(c.dedupe_key!);
    const dupInDb = seenInDb.has(c.dedupe_key!);

    if (breakdown.dropReason === "no_positive_hits") {
      status = "no_positive_hits";
    } else if (breakdown.dropReason === "negative_in_title") {
      status = "negative_in_title";
    } else if (breakdown.dropReason === "below_threshold") {
      status = "below_threshold";
    } else if (dupInDb) {
      status = "duplicate_in_db";
    } else if (dupInBatch) {
      status = "duplicate_in_batch";
    } else {
      status = "would_insert";
    }

    bumpLaneStat(queryLaneStatsMap, laneKeysForCandidate(c), status);

    const intake_debug = buildNewsIntakeDebug(c, breakdown);

    candidates.push({
      headline: c.headline,
      source_name: c.source_name,
      source_url: c.source_url,
      canonical_url: c.canonical_url,
      // Trim merged body text in the preview payload — UI only needs ~600
      // chars to show context, and we don't want a 12KB blob per row.
      summary: c.summary ? c.summary.slice(0, 600) : null,
      thumbnail_url: c.thumbnail_url,
      published_at: c.published_at,
      is_satire: c.is_satire,
      source_weight: c.source_weight ?? 0,
      dedupe_key: c.dedupe_key!,
      breakdown,
      intake_debug,
      enriched_from_body: c.enriched_from_body === true,
      score_before_body: c.score_before_body ?? null,
      alreadyInDb: dupInDb,
      status,
    });
  }

  // Sort: would_insert first (highest score), then by score desc within group.
  const groupRank: Record<PreviewCandidate["status"], number> = {
    would_insert: 0,
    below_threshold: 1,
    duplicate_in_batch: 2,
    duplicate_in_db: 3,
    negative_in_title: 4,
    no_positive_hits: 5,
  };
  candidates.sort((a, b) => {
    const g = groupRank[a.status] - groupRank[b.status];
    if (g !== 0) return g;
    return b.breakdown.rawScore - a.breakdown.rawScore;
  });

  const byStatus: Record<PreviewCandidate["status"], number> = {
    would_insert: 0,
    below_threshold: 0,
    no_positive_hits: 0,
    negative_in_title: 0,
    duplicate_in_db: 0,
    duplicate_in_batch: 0,
  };
  for (const c of candidates) byStatus[c.status] += 1;

  const queryLaneStats = [...queryLaneStatsMap.values()].sort((a, b) => b.fetched - a.fetched);

  return {
    totalFetched: rawFetched.length,
    blockedCount: rawFetched.length - fetched.length,
    byStatus,
    candidates,
    queryLaneStats,
  };
}

/**
 * Insert a single candidate into news_items as pending, bypassing all scoring
 * and dedupe gates. Used by the admin "Insert as pending" button on a preview
 * row to bring an item the scorer rejected into the approval queue.
 */
export async function insertManualCandidate(
  supabase: SupaClient,
  c: PreviewCandidate
): Promise<{ inserted: boolean; error?: string }> {
  const intake =
    c.intake_debug ??
    ({
      provider: "manual_admin_insert",
      matched_queries: [],
      feed_source: null,
      matched_title_terms: c.breakdown.matchedTitleTerms ?? [],
      matched_body_terms: c.breakdown.matchedBodyTerms ?? [],
      matched_terms: c.breakdown.matchedTerms ?? [],
      le_boost_hits: c.breakdown.leBoostHits ?? [],
      le_boost_score: c.breakdown.leBoostAmount ?? 0,
      compound_bonuses: c.breakdown.compoundLabels ?? [],
      compound_score: c.breakdown.compoundAmount ?? 0,
      final_score: c.breakdown.score,
      raw_score: c.breakdown.rawScore,
      inclusion_reason:
        "Inserted manually by admin from preview; scoring snapshot from preview row.",
    } satisfies NewsIntakeDebug);

  const { error } = await supabase
    .from("news_items")
    .upsert(
      [
        {
          headline: c.headline,
          source_name: c.source_name,
          source_url: c.source_url,
          canonical_url: c.canonical_url,
          summary: c.summary,
          thumbnail_url: c.thumbnail_url,
          published_at: c.published_at,
          tags: [],
          relevance_score: c.breakdown.score,
          dedupe_key: c.dedupe_key,
          raw_payload: {
            provider: "manual_admin_insert",
            from_preview: true,
            intake_debug: { ...intake, inclusion_reason: `${intake.inclusion_reason} (manual queue insert).` },
          } as Record<string, unknown>,
          content_type: "news",
          is_satire: c.is_satire,
          status: "pending" as const,
        },
      ],
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    );
  if (error) return { inserted: false, error: error.message };
  return { inserted: true };
}
