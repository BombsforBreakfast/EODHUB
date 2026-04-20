// Shared types for the news ingestion + feed integration.
//
// Two main shapes:
//   - NewsCandidate: in-memory shape during ingestion (raw → normalized → scored).
//   - NewsItem:      row shape returned from the database for feed rendering.
//
// FeedItem is the discriminated union the main feed renders. Real user posts
// keep their existing shape; news items get their own card.

export type NewsCandidate = {
  headline: string;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  tags: string[];
  is_satire: boolean;
  /** Original payload from the provider for debugging / future reference. */
  raw: Record<string, unknown>;
  /** Filled in by scoring. */
  relevance_score?: number;
  /** Filled in by dedupe. */
  dedupe_key?: string;
  /** Filled in by dedupe — used for in-batch and DB-window dup detection. */
  headline_key?: string;
  /** Source weight used by scoring + tie-breaking inside dedupe. */
  source_weight?: number;
  /** True if the runner fetched the article body and folded it into `summary`. */
  enriched_from_body?: boolean;
  /** Score before body-fetch enrichment ran. Useful for debug/preview. */
  score_before_body?: number;
};

export type NewsItem = {
  id: string;
  headline: string;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  summary: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  ingested_at: string;
  tags: string[];
  relevance_score: number | null;
  is_satire: boolean;
  status: "pending" | "published" | "rejected";
  created_at: string;
};

/**
 * Discriminated union the feed renders. Keeping the news shape thin (no fake
 * user_id, no fake comment counts) is the entire point of doing the merge in
 * the app layer instead of UNIONing into ranked_posts.
 */
export type FeedItem =
  | { kind: "post"; id: string; sortKey: number; data: unknown }
  | { kind: "news"; id: string; sortKey: number; data: NewsItem };

export type IngestionStats = {
  fetched: number;
  scored: number;
  belowThreshold: number;
  duplicates: number;
  inserted: number;
  capped: number;
  /** How many borderline candidates we body-fetched in this run. */
  bodyFetched: number;
  /** Of those, how many crossed threshold thanks to the body content. */
  bodyEnrichedPasses: number;
  errors: string[];
};
