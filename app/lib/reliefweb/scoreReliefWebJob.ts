import {
  CONFIDENCE_THRESHOLDS,
  FIELD_WEIGHT_CAPS,
  HARD_EXCLUSION_TERMS,
  MATCH_POINTS,
  MEDIUM_POSITIVE_KEYWORDS,
  NEGATIVE_KEYWORDS,
  STRONG_POSITIVE_KEYWORDS,
  type ReliefWebConfidence,
  type ReliefWebFieldLabel,
} from "./relevanceConfig";

export type ReliefWebJobScoreInput = {
  title: string;
  description: string;
  /** Organization, countries, ReliefWeb themes/categories combined. */
  metadataText: string;
  /** ReliefWeb theme tags — used to rescue generic titles tagged Mine Action. */
  themes?: string[];
};

export type ReliefWebJobScore = {
  score: number;
  confidence: ReliefWebConfidence;
  reasons: string[];
  needsReview: boolean;
  suppressed: boolean;
  excluded: boolean;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termMatches(text: string, term: string): boolean {
  const t = term.toLowerCase();
  const lower = text.toLowerCase();
  if (t.length <= 3 && !t.includes(" ")) {
    return new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(lower);
  }
  return lower.includes(t);
}

function formatReason(sign: "+" | "-", term: string, field: ReliefWebFieldLabel): string {
  const fieldLabel = field === "body" ? "description" : field;
  return `${sign} ${term} in ${fieldLabel}`;
}

function scoreField(
  text: string,
  field: ReliefWebFieldLabel,
  cap: number
): { points: number; reasons: string[] } {
  let points = 0;
  const reasons: string[] = [];

  const applyMatches = (
    terms: string[],
    matchPoints: number,
    sign: "+" | "-"
  ) => {
    for (const term of terms) {
      if (!termMatches(text, term)) continue;
      if (sign === "+") {
        if (points >= cap) break;
        const add = Math.min(matchPoints, cap - points);
        if (add <= 0) continue;
        points += add;
        reasons.push(formatReason(sign, term, field));
      } else {
        points -= matchPoints;
        reasons.push(formatReason(sign, term, field));
      }
    }
  };

  applyMatches(STRONG_POSITIVE_KEYWORDS, MATCH_POINTS.strong[field], "+");
  applyMatches(MEDIUM_POSITIVE_KEYWORDS, MATCH_POINTS.medium[field], "+");

  return { points: Math.max(0, Math.min(cap, points)), reasons };
}

function scoreNegativeField(
  text: string,
  field: ReliefWebFieldLabel
): { penalty: number; reasons: string[] } {
  let penalty = 0;
  const reasons: string[] = [];
  for (const term of NEGATIVE_KEYWORDS) {
    if (!termMatches(text, term)) continue;
    penalty += MATCH_POINTS.negative[field];
    reasons.push(formatReason("-", term, field));
  }
  return { penalty, reasons };
}

function hasStrongTitleMatch(title: string): boolean {
  return STRONG_POSITIVE_KEYWORDS.some((term) => termMatches(title, term));
}

export function shouldExcludeReliefWebJob(title: string, body: string, metadataText = ""): boolean {
  const text = `${title}\n${body}\n${metadataText}`.toLowerCase();
  return HARD_EXCLUSION_TERMS.some((term) => termMatches(text, term));
}

function hasMineActionTheme(themes: string[] | undefined): boolean {
  return (themes ?? []).some((t) => t.toLowerCase().includes("mine action"));
}

export function scoreReliefWebJob(input: ReliefWebJobScoreInput): ReliefWebJobScore {
  const title = input.title.trim();
  const description = input.description.trim();
  const metadataText = input.metadataText.trim();
  const mineActionTheme = hasMineActionTheme(input.themes);

  if (shouldExcludeReliefWebJob(title, description, metadataText)) {
    return {
      score: 0,
      confidence: "low",
      reasons: ["Excluded: hard-block term matched"],
      needsReview: false,
      suppressed: true,
      excluded: true,
    };
  }

  const titleResult = scoreField(title, "title", FIELD_WEIGHT_CAPS.title);
  const metadataResult = scoreField(metadataText, "metadata", FIELD_WEIGHT_CAPS.metadata);
  const bodyResult = scoreField(description, "body", FIELD_WEIGHT_CAPS.body);

  const titleNeg = scoreNegativeField(title, "title");
  const metadataNeg = scoreNegativeField(metadataText, "metadata");
  const bodyNeg = scoreNegativeField(description, "body");

  let negativePenalty =
    titleNeg.penalty + metadataNeg.penalty + bodyNeg.penalty;

  const strongTitle = hasStrongTitleMatch(title);
  if (strongTitle && negativePenalty > 0) {
    negativePenalty = Math.round(negativePenalty * 0.35);
  }

  const positiveTotal = titleResult.points + metadataResult.points + bodyResult.points;
  let score = Math.round(Math.max(0, Math.min(100, positiveTotal - negativePenalty)));

  if (strongTitle) {
    score = Math.max(score, CONFIDENCE_THRESHOLDS.high);
  } else if (mineActionTheme) {
    score = Math.max(score, CONFIDENCE_THRESHOLDS.possible);
  }

  let confidence: ReliefWebConfidence = "low";
  if (score >= CONFIDENCE_THRESHOLDS.high) confidence = "high";
  else if (score >= CONFIDENCE_THRESHOLDS.possible) confidence = "possible";

  const reasons = [
    ...(mineActionTheme ? ["+ Mine Action theme tag"] : []),
    ...titleResult.reasons,
    ...metadataResult.reasons,
    ...bodyResult.reasons,
    ...titleNeg.reasons,
    ...metadataNeg.reasons,
    ...bodyNeg.reasons,
  ].slice(0, 20);

  const suppressed = confidence === "low";
  const needsReview = confidence !== "high";

  return {
    score,
    confidence,
    reasons,
    needsReview,
    suppressed,
    excluded: false,
  };
}

/** @deprecated Use scoreReliefWebJob — kept for import route transition. */
export function shouldIngestReliefWebJob(
  _score: number,
  title: string,
  body: string,
  metadataText = ""
): boolean {
  return !shouldExcludeReliefWebJob(title, body, metadataText);
}
