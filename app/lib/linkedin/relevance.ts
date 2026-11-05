import { positiveJobSignals } from "../jobPositiveSignals";
import { detectAdzunaCategory, type AdzunaRelevanceResult } from "../adzuna/relevance";
export type LinkedInRelevanceInput = { title: string; description: string; companyName: string };
export function linkedInHardExcludeReason(_input: LinkedInRelevanceInput): string | null { return null; }
export function scoreLinkedInJob(input: LinkedInRelevanceInput, _options?: { searchQuery?: string }): AdzunaRelevanceResult {
  const result = positiveJobSignals(input.title, input.description);
  return { score: result.score, reasons: result.reasons, relevant: true, militaryRecruitment: false };
}
export { detectAdzunaCategory as detectLinkedInCategory };
