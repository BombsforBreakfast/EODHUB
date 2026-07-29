import {
  detectAdzunaCategory,
  scoreAdzunaJob,
  STRONG_RELEVANT_TERMS,
  type AdzunaRelevanceResult,
} from "../adzuna/relevance";

export type LinkedInRelevanceInput = {
  title: string;
  description: string;
  companyName: string;
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

function titleHasStrongOrdnanceSignal(title: string): boolean {
  return STRONG_RELEVANT_TERMS.some((term) => termMatches(title, term));
}

function isHumanitarianMineTitle(title: string): boolean {
  return (
    /\bdemining\b/i.test(title) ||
    /\bmine\s+action\b/i.test(title) ||
    /\bhumanitarian\s+mine\b/i.test(title) ||
    /\buxo\b/i.test(title) ||
    /\bunexploded\b/i.test(title) ||
    /\beod\b/i.test(title) ||
    /\bordnance\b/i.test(title)
  );
}

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
  {
    id: "civilian_mining",
    label: "civilian mining / extractives",
    // Keep demining / mine-action / UXO titles; drop industrial mining noise.
    test: (title) => {
      if (isHumanitarianMineTitle(title)) return false;
      return (
        /\bmining\b/i.test(title) ||
        /\bmine\s+(operator|drill|heavy\s+equipment|geologist|engineer)\b/i.test(title) ||
        /\bunderground\s+geologist\b/i.test(title) ||
        /\bdrill\s+and\s+blast\b/i.test(title) ||
        /\bblast\s+engineer\b/i.test(title)
      );
    },
  },
  {
    id: "console_operator",
    label: "console operator",
    test: (title) => /\bconsole\s+operator\b/i.test(title),
  },
  {
    id: "security_specialist_generic",
    label: "generic security specialist",
    test: (title) => {
      if (!/\bsecurity\s+specialist\b/i.test(title)) return false;
      return !isHumanitarianMineTitle(title) && !/\b(explosive|ordnance|munitions|hazardous\s+devices)\b/i.test(title);
    },
  },
  {
    id: "special_security_rep",
    label: "special security representative",
    test: (title) => /\bspecial\s+security\s+representative\b/i.test(title),
  },
  {
    id: "warfighting_capability",
    label: "warfighting capability analyst",
    test: (title) => /\bwarfighting\s+capability\b/i.test(title),
  },
  {
    id: "train_driver",
    label: "train driver",
    test: (title) => /\btrain\s+drivers?\b/i.test(title) || /\btrainee\s+train\s+driver\b/i.test(title),
  },
  {
    id: "traffic_controller",
    label: "traffic controller",
    test: (title) => /\btraffic\s+controller\b/i.test(title),
  },
  {
    id: "document_controller",
    label: "document controller",
    test: (title) => /\bdocument\s+controller\b/i.test(title),
  },
  {
    id: "title_abstractor",
    label: "title abstractor",
    test: (title) => /\btitle\s+abstractor/i.test(title),
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

  const scored = scoreAdzunaJob(
    {
      title: input.title,
      description: input.description,
      companyName: input.companyName,
    },
    { intakeChannel: options?.searchQuery ? `li:${options.searchQuery}` : undefined },
  );

  // LinkedIn search recall is noisy — body-only floors (~55) pull in mining,
  // SOC, and generic contractor roles. Require a strong ordnance signal in the title.
  if (scored.relevant && !titleHasStrongOrdnanceSignal(input.title)) {
    return {
      ...scored,
      relevant: false,
      reasons: [...scored.reasons, "Excluded: weak LinkedIn title match"].slice(0, 12),
    };
  }

  return scored;
}

export { detectAdzunaCategory as detectLinkedInCategory };
