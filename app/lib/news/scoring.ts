// Relevance scorer. Pure function over a NewsCandidate → number.
//
// Tuning lives in app/lib/news/config/keywords.ts (SCORE constants + lists).
// Threshold gating is centralized here so the runner can stay declarative.

import {
  POSITIVE_TITLE,
  POSITIVE_BODY,
  LE_MIL_CONTEXT,
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

export type ScoreBreakdown = {
  /** Final score after the hard "no positive hit" gate. This is what the runner uses. */
  score: number;
  /** Score WITHOUT the hard gate — useful for preview/debugging. */
  rawScore: number;
  titleHits: number;
  bodyHits: number;
  hasContext: boolean;
  freshnessBonus: number;
  sourceWeight: number;
  negativeIn: "title" | "body" | null;
  /** Why the item was dropped, or null if it passed. */
  dropReason: "no_positive_hits" | "below_threshold" | "negative_in_title" | null;
};

/** Pure computation, no mutation. Used by both runner and preview. */
export function analyzeCandidate(c: NewsCandidate): ScoreBreakdown {
  const title = c.headline.toLowerCase();
  const body = (c.summary ?? "").toLowerCase();

  if (!c.is_satire) {
    const host = hostOf(c.source_url);
    if (host && SATIRE_DOMAINS.includes(host)) c.is_satire = true;
  }

  const titleHits = countHits(title, POSITIVE_TITLE);
  const bodyHits = countHits(body, POSITIVE_BODY);

  let raw = 0;
  raw += Math.min(titleHits * SCORE.perTitleHit, SCORE.maxTitleBonus);
  raw += Math.min(bodyHits * SCORE.perBodyHit, SCORE.maxBodyBonus);

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
