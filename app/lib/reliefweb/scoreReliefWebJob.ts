import { positiveJobSignals } from "../jobPositiveSignals";
import type { ReliefWebConfidence } from "./relevanceConfig";
export type ReliefWebJobScoreInput = { title: string; description: string; metadataText: string; themes?: string[] };
export type ReliefWebJobScore = { score: number; confidence: ReliefWebConfidence; reasons: string[]; needsReview: boolean; suppressed: boolean; excluded: boolean };
export function shouldExcludeReliefWebJob(_title: string, _body: string, _metadataText = ""): boolean { return false; }
export function scoreReliefWebJob(input: ReliefWebJobScoreInput): ReliefWebJobScore {
  const result = positiveJobSignals(input.title, input.description);
  return { score: result.score, reasons: result.reasons, confidence: result.score >= 70 ? "high" : result.score >= 40 ? "possible" : "low", needsReview: true, suppressed: false, excluded: false };
}
export function shouldIngestReliefWebJob(_score: number, _title: string, _body: string, _metadataText = ""): boolean { return true; }
