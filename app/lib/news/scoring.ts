// Relevance scorer. Pure function over a NewsCandidate → number.
//
// Tuning lives in app/lib/news/config/keywords.ts (SCORE constants + lists).
// Threshold gating is centralized here so the runner can stay declarative.

import {
  POSITIVE_TITLE,
  POSITIVE_BODY,
  LE_MIL_CONTEXT,
  LE_EXPLOSIVES_BOOST,
  NEGATIVE_PHRASES,
  SATIRE_DOMAINS,
  MIN_SCORE,
  MIN_SCORE_SATIRE,
  SCORE,
} from "./config/keywords";
import type { NewsCandidate } from "./types";

function countHits(text: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    if (text.includes(needle)) n += 1;
  }
  return n;
}

/** Which needles matched, in list order (stable for debugging). */
export function collectMatched(text: string, needles: string[]): string[] {
  const out: string[] = [];
  for (const needle of needles) {
    if (text.includes(needle)) out.push(needle);
  }
  return out;
}

function anyHit(text: string, needles: string[]): boolean {
  for (const needle of needles) {
    if (text.includes(needle)) return true;
  }
  return false;
}

function freshnessScore(publishedIso: string | null): number {
  if (!publishedIso) return 0;
  const t = new Date(publishedIso).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageHours = (Date.now() - t) / 3_600_000;
  if (ageHours < 0) return 0; // future-dated → don't reward
  if (ageHours < 6) return SCORE.freshnessUnder6h;
  if (ageHours < 24) return SCORE.freshnessUnder24h;
  if (ageHours < 72) return 0;
  return SCORE.freshnessOver72hPenalty;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

const COMPOUND_CAP = 14;

function compoundScore(full: string): { amount: number; labels: string[] } {
  const labels: string[] = [];
  let amount = 0;
  const tryAdd = (label: string, bonus: number, ok: boolean) => {
    if (!ok || amount >= COMPOUND_CAP) return;
    const add = Math.min(bonus, COMPOUND_CAP - amount);
    if (add <= 0) return;
    labels.push(label);
    amount += add;
  };

  tryAdd(
    "training_facility+explosion",
    5,
    full.includes("training facility") && full.includes("explosion")
  );
  tryAdd(
    "deputies+killed_or_fatal+explosion_or_blast",
    5,
    (full.includes("deputies killed") ||
      (full.includes("deputies") &&
        (full.includes("killed") || full.includes("kills") || full.includes("fatal")))) &&
      (full.includes("explosion") || full.includes("blast"))
  );
  tryAdd(
    "sheriff_deputies+blast",
    4,
    full.includes("sheriff") && full.includes("deputies") && full.includes("blast")
  );
  tryAdd(
    "lasd+explosion_or_blast",
    4,
    full.includes("lasd") && (full.includes("explosion") || full.includes("blast"))
  );
  tryAdd(
    "bomb_squad+explosion_or_blast",
    4,
    full.includes("bomb squad") && (full.includes("explosion") || full.includes("blast"))
  );

  return { amount, labels };
}

function computeLeBoost(full: string): { amount: number; hits: string[] } {
  const hits = collectMatched(full, LE_EXPLOSIVES_BOOST);
  const raw = hits.length * SCORE.leBoostPerHit;
  const amount = Math.min(raw, SCORE.leBoostMax);
  return { amount, hits };
}

export type NewsIntakeDebug = {
  provider: string;
  matched_queries: string[];
  feed_source: string | null;
  matched_title_terms: string[];
  matched_body_terms: string[];
  /** De-duplicated union of title + body positive matches (for quick scanning). */
  matched_terms: string[];
  le_boost_hits: string[];
  le_boost_score: number;
  compound_bonuses: string[];
  compound_score: number;
  final_score: number;
  raw_score: number;
  inclusion_reason: string;
};

export type ScoreBreakdown = {
  /** Final score after the hard "no positive hit" gate. This is what the runner uses. */
  score: number;
  /** Score WITHOUT the hard gate — useful for preview/debugging. */
  rawScore: number;
  titleHits: number;
  bodyHits: number;
  matchedTitleTerms: string[];
  matchedBodyTerms: string[];
  matchedTerms: string[];
  leBoostHits: string[];
  leBoostAmount: number;
  compoundLabels: string[];
  compoundAmount: number;
  hasContext: boolean;
  freshnessBonus: number;
  sourceWeight: number;
  negativeIn: "title" | "body" | null;
  /** Why the item was dropped, or null if it passed. */
  dropReason: "no_positive_hits" | "below_threshold" | "negative_in_title" | null;
};

function buildInclusionReason(b: ScoreBreakdown, c: NewsCandidate): string {
  if (b.dropReason === "no_positive_hits") {
    return "Dropped: no headline/body match on the core EOD / LE explosives keyword lists.";
  }
  if (b.dropReason === "negative_in_title") {
    return "Dropped: entertainment or metaphor penalty phrase in the headline.";
  }
  if (b.dropReason === "below_threshold") {
    return `Dropped: score ${b.score} is below the minimum for ${c.is_satire ? "satire" : "news"} items.`;
  }
  const parts = [
    `Included for manual review: relevance score ${b.score}.`,
    `Title keyword matches (${b.titleHits}): ${b.matchedTitleTerms.slice(0, 8).join(", ") || "—"}.`,
    `Body/snippet matches (${b.bodyHits}): ${b.matchedBodyTerms.slice(0, 8).join(", ") || "—"}.`,
  ];
  if (b.leBoostAmount > 0) {
    parts.push(`LE explosives boost +${b.leBoostAmount} (${b.leBoostHits.slice(0, 6).join(", ")}).`);
  }
  if (b.compoundAmount > 0) {
    parts.push(`Compound context +${b.compoundAmount} [${b.compoundLabels.join(", ")}].`);
  }
  if (b.freshnessBonus !== 0) parts.push(`Freshness ${b.freshnessBonus > 0 ? "+" : ""}${b.freshnessBonus}.`);
  if (b.sourceWeight !== 0) parts.push(`Trusted feed weight +${b.sourceWeight}.`);
  return parts.join(" ");
}

export function buildNewsIntakeDebug(c: NewsCandidate, b: ScoreBreakdown): NewsIntakeDebug {
  const raw = c.raw ?? {};
  const provider = typeof raw.provider === "string" ? raw.provider : "unknown";
  const matched_queries = [...(c.matched_discovery_queries ?? [])];
  const feed_source =
    provider === "feeds" && typeof raw.feed === "string"
      ? raw.feed
      : provider === "feeds"
        ? c.source_name
        : null;

  const matched_terms = [...new Set([...b.matchedTitleTerms, ...b.matchedBodyTerms])];

  return {
    provider,
    matched_queries: matched_queries.length > 0 ? matched_queries : provider === "feeds" ? [`feed:${feed_source ?? "rss"}`] : [],
    feed_source,
    matched_title_terms: b.matchedTitleTerms,
    matched_body_terms: b.matchedBodyTerms,
    matched_terms,
    le_boost_hits: b.leBoostHits,
    le_boost_score: b.leBoostAmount,
    compound_bonuses: b.compoundLabels,
    compound_score: b.compoundAmount,
    final_score: b.score,
    raw_score: b.rawScore,
    inclusion_reason: buildInclusionReason(b, c),
  };
}

/** Pure computation, no mutation. Used by both runner and preview. */
export function analyzeCandidate(c: NewsCandidate): ScoreBreakdown {
  const title = c.headline.toLowerCase();
  const body = (c.summary ?? "").toLowerCase();
  const full = `${title} ${body}`;

  if (!c.is_satire) {
    const host = hostOf(c.source_url);
    if (host && SATIRE_DOMAINS.includes(host)) c.is_satire = true;
  }

  const matchedTitleTerms = collectMatched(title, POSITIVE_TITLE);
  const matchedBodyTerms = collectMatched(body, POSITIVE_BODY);
  const titleHits = matchedTitleTerms.length;
  const bodyHits = matchedBodyTerms.length;
  const matchedTerms = [...new Set([...matchedTitleTerms, ...matchedBodyTerms])];

  const { amount: compoundAmount, labels: compoundLabels } = compoundScore(full);
  const { amount: leBoostAmount, hits: leBoostHits } = computeLeBoost(full);

  let raw = 0;
  raw += Math.min(titleHits * SCORE.perTitleHit, SCORE.maxTitleBonus);
  raw += Math.min(bodyHits * SCORE.perBodyHit, SCORE.maxBodyBonus);
  raw += leBoostAmount;
  raw += compoundAmount;

  const hasContext = anyHit(title, LE_MIL_CONTEXT) || anyHit(body, LE_MIL_CONTEXT);
  if (hasContext) raw += SCORE.contextBonus;

  const freshness = freshnessScore(c.published_at);
  raw += freshness;

  const sourceWeight = c.source_weight ?? 0;
  raw += sourceWeight;

  let negativeIn: "title" | "body" | null = null;
  if (anyHit(title, NEGATIVE_PHRASES)) {
    raw += SCORE.negativeTitlePenalty;
    negativeIn = "title";
  } else if (anyHit(body, NEGATIVE_PHRASES)) {
    raw += SCORE.negativeBodyPenalty;
    negativeIn = "body";
  }

  // Hard gate: zero EOD-specific keyword hits → score = 0 regardless of how
  // fresh, military-framed, or trusted-source the item is.
  let score = raw;
  let dropReason: ScoreBreakdown["dropReason"] = null;
  if (titleHits === 0 && bodyHits === 0) {
    score = 0;
    dropReason = "no_positive_hits";
  } else if (negativeIn === "title") {
    dropReason = "negative_in_title";
  } else {
    const min = c.is_satire ? MIN_SCORE_SATIRE : MIN_SCORE;
    if (score < min) dropReason = "below_threshold";
  }

  return {
    score,
    rawScore: raw,
    titleHits,
    bodyHits,
    matchedTitleTerms,
    matchedBodyTerms,
    matchedTerms,
    leBoostHits,
    leBoostAmount,
    compoundLabels,
    compoundAmount,
    hasContext,
    freshnessBonus: freshness,
    sourceWeight,
    negativeIn,
    dropReason,
  };
}

export function scoreCandidate(c: NewsCandidate): number {
  return analyzeCandidate(c).score;
}

/** Threshold gate. Satire lane gets a lower bar because the headlines often
 *  read as jokes and won't pattern-match military jargon as cleanly. */
export function passesThreshold(c: NewsCandidate, score: number): boolean {
  const min = c.is_satire ? MIN_SCORE_SATIRE : MIN_SCORE;
  return score >= min;
}
