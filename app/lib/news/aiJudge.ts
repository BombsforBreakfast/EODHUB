/**
 * LLM relevance gate for Rumint news ingestion.
 *
 * Discovery (GDELT + RSS) + keyword scoring stay as cheap recall.
 * This judge is the precision filter: only stories that *explicitly* involve
 * bomb tech / EOD / UXO / IED / bomb squad work should reach the pending queue.
 *
 * Auth: Vercel AI Gateway via OIDC (`vercel env pull`) or `AI_GATEWAY_API_KEY`.
 * Jobs imports never needed this — they don't call language models.
 */

import { generateObject } from "ai";
import { z } from "zod";

import type { NewsCandidate } from "./types";

export const NEWS_AI_MODEL =
  process.env.NEWS_AI_MODEL?.trim() || "google/gemini-2.5-flash";

/** Explicit on-topic vocabulary the model must see referenced in the story. */
export const BOMB_TECH_EXPLICIT_TERMS = [
  "bomb disposal",
  "explosive ordnance disposal",
  "EOD",
  "UXO",
  "unexploded ordnance",
  "bomb technician",
  "bomb tech",
  "bomb squad",
  "bomb threat",
  "IED",
  "improvised explosive device",
] as const;

const JudgeSchema = z.object({
  relevant: z
    .boolean()
    .describe(
      "True only if the story is explicitly about real-world bomb disposal / EOD / UXO / bomb squad / IED / bomb threat work.",
    ),
  confidence: z.number().min(0).max(1),
  matchedTerms: z
    .array(z.string())
    .describe("Which of the required term families appear in the story (empty if none)."),
  reason: z.string().max(280),
});

export type NewsAiJudgeResult = z.infer<typeof JudgeSchema> & {
  model: string;
};

export type NewsAiJudgeBatchStats = {
  judged: number;
  accepted: number;
  rejected: number;
  errors: string[];
  skippedReason: string | null;
};

function isAiGatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.VERCEL === "1",
  );
}

function buildPrompt(c: NewsCandidate): string {
  const terms = BOMB_TECH_EXPLICIT_TERMS.map((t) => `- ${t}`).join("\n");
  const summary = (c.summary ?? "").slice(0, 2500);
  return `You screen news for EOD-HUB RUMINT (a professional EOD / bomb technician community feed).

Accept ONLY if the article is clearly about real-world work involving at least one of:
${terms}

ACCEPT examples: bomb squad callout, UXO discovered and rendered safe, EOD team controlled detonation, IED found, bomb threat evacuation with bomb techs responding.
REJECT examples: metaphorical "bombshell", sports "bomb", weather bomb cyclone, generic explosion with no bomb tech / EOD / UXO / bomb squad / IED / bomb threat role, entertainment, finance.

Satire about military/EOD life may be accepted if it is clearly EOD-themed (Duffel Blog style).

Headline: ${c.headline}
Source: ${c.source_name ?? "unknown"}
URL: ${c.source_url}
Published: ${c.published_at ?? "unknown"}
Summary/body excerpt:
${summary || "(none)"}
`;
}

export async function judgeNewsCandidate(
  c: NewsCandidate,
): Promise<NewsAiJudgeResult | null> {
  const { object } = await generateObject({
    model: NEWS_AI_MODEL,
    schema: JudgeSchema,
    prompt: buildPrompt(c),
    temperature: 0,
  });
  return { ...object, model: NEWS_AI_MODEL };
}

/**
 * Judge candidates concurrently. Returns only those the model marks relevant.
 * If AI Gateway auth is missing, returns null so the caller can fall back.
 */
export async function filterCandidatesWithAiJudge(
  candidates: NewsCandidate[],
  opts?: { concurrency?: number },
): Promise<{ kept: NewsCandidate[]; stats: NewsAiJudgeBatchStats } | null> {
  if (candidates.length === 0) {
    return {
      kept: [],
      stats: {
        judged: 0,
        accepted: 0,
        rejected: 0,
        errors: [],
        skippedReason: null,
      },
    };
  }

  if (!isAiGatewayConfigured()) {
    return null;
  }

  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 3, 5));
  const stats: NewsAiJudgeBatchStats = {
    judged: 0,
    accepted: 0,
    rejected: 0,
    errors: [],
    skippedReason: null,
  };
  const kept: NewsCandidate[] = [];

  for (let i = 0; i < candidates.length; i += concurrency) {
    const slice = candidates.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map(async (c) => {
        try {
          const judgment = await judgeNewsCandidate(c);
          return { c, judgment, error: null as string | null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { c, judgment: null, error: msg };
        }
      }),
    );

    for (const row of results) {
      stats.judged += 1;
      if (row.error || !row.judgment) {
        stats.errors.push(`${row.c.headline.slice(0, 80)}: ${row.error ?? "empty judgment"}`);
        continue;
      }
      const judgment = row.judgment;
      row.c.raw = {
        ...row.c.raw,
        ai_judge: {
          relevant: judgment.relevant,
          confidence: judgment.confidence,
          matchedTerms: judgment.matchedTerms,
          reason: judgment.reason,
          model: judgment.model,
        },
      };
      if (judgment.relevant && judgment.confidence >= 0.55) {
        stats.accepted += 1;
        kept.push(row.c);
      } else {
        stats.rejected += 1;
      }
    }
  }

  return { kept, stats };
}
