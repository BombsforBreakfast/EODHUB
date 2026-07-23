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

/**
 * Hard omissions for LinkedIn intake only — keep UAS broadly, but drop these
 * roles / MQ-9-specific listings that keep sneaking into EOD-adjacent searches.
 */
export const LINKEDIN_HARD_EXCLUDE_PATTERNS: ReadonlyArray<{
  id: string;
  label: string;
  test: (title: string, haystack: string) => boolean;
}> = [
  {
    id: "counterintelligence",
    label: "counterintelligence",
    test: (_title, haystack) =>
      /\bcounter[\s-]?intelligence\b/i.test(haystack) || /\b35L\b/i.test(haystack),
  },
  {
    id: "dive_locker",
    label: "dive locker operations",
    test: (_title, haystack) => /\bdive\s+locker\b/i.test(haystack),
  },
  {
    id: "air_traffic",
    label: "air traffic control",
    test: (title, haystack) =>
      /\bair\s+traffic\s+control(?:ler|ling)?\b/i.test(haystack) ||
      /\bATC\b/.test(title),
  },
  {
    id: "personal_protection",
    label: "personal protection officer",
    test: (_title, haystack) =>
      /\bpersonal\s+protection\s+officer\b/i.test(haystack) ||
      /\bpersonal\s+protection\b/i.test(haystack),
  },
  {
    id: "mq9",
    label: "MQ-9",
    // Keep other UAS roles; only omit MQ-9 / Reaper-specific jobs.
    test: (_title, haystack) => /\bMQ[\s-]?9\b/i.test(haystack) || /\breaper\b/i.test(haystack),
  },
  {
    id: "sere",
    label: "SERE instructor",
    test: (_title, haystack) => /\bSERE\b/i.test(haystack),
  },
  {
    id: "humint",
    label: "HUMINT",
    test: (_title, haystack) =>
      /\bHUMINT\b/i.test(haystack) || /\bhuman\s+intelligence\b/i.test(haystack),
  },
];

export function linkedInHardExcludeReason(input: LinkedInRelevanceInput): string | null {
  const title = input.title.trim();
  const haystack = `${title}\n${input.description}\n${input.companyName}`.trim();
  for (const rule of LINKEDIN_HARD_EXCLUDE_PATTERNS) {
    if (rule.test(title, haystack)) return rule.label;
  }
  return null;
}

export function scoreLinkedInJob(
  input: LinkedInRelevanceInput,
  options?: { searchQuery?: string },
): AdzunaRelevanceResult {
  const excluded = linkedInHardExcludeReason(input);
  if (excluded) {
    return {
      score: 0,
      relevant: false,
      reasons: [`Excluded: ${excluded}`],
      militaryRecruitment: false,
    };
  }

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
