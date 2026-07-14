import {
  detectAdzunaCategory,
  scoreAdzunaJob,
  type AdzunaRelevanceResult,
} from "../adzuna/relevance";

export type LinkedInRelevanceInput = {
  title: string;
  description: string;
  companyName: string;
};

export function scoreLinkedInJob(
  input: LinkedInRelevanceInput,
  options?: { searchQuery?: string },
): AdzunaRelevanceResult {
  return scoreAdzunaJob(
    {
      title: input.title,
      description: input.description,
      companyName: input.companyName,
    },
    { intakeChannel: options?.searchQuery ? `li:${options.searchQuery}` : undefined },
  );
}

export { detectAdzunaCategory as detectLinkedInCategory };
