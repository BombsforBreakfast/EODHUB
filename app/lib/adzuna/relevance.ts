/**
 * Adzuna relevance — title, description, and company (not title-only).
 */

export const STRONG_RELEVANT_TERMS = [
  "eod",
  "explosive ordnance",
  "explosives specialist",
  "explosives handler",
  "explosive safety",
  "uxo",
  "unexploded",
  "ordnance",
  "bomb tech",
  "bomb squad",
  "hazardous devices",
  "demining",
  "mine action",
  "humanitarian mine action",
  "hma",
  "cied",
  "c-ied",
  "counter-ied",
  "counter ied",
  "improvised explosive",
  "iedd",
  "disposal",
  "ammunition",
  "munitions",
  "render safe",
  "tss-e",
  "cbrn",
  "cbrne",
  "uas",
  "unmanned aerial",
  "cuas",
  "counter-uas",
  "counter uas",
  "c-uas",
  "drone operator",
  "cwmd",
  "c-wmd",
  "counter weapons of mass destruction",
  "wmd",
  "weapons of mass destruction",
  "direct action eod",
  "direct action",
  "explosive handler",
  "pyrotechnic",
  "blasting",
  "clearance",
] as const;

export const MEDIUM_RELEVANT_TERMS = [
  "explosive",
  "ordnance technician",
  "ammunition technician",
  "weapons",
  "hazmat",
  "hazardous materials",
  "security specialist",
  "range safety",
  "unexploded ordnance",
] as const;

export const MILITARY_RECRUITMENT_TERMS = [
  "recruiter",
  "rotc",
  "basic training",
  "officer candidate",
  "officer training",
  "enlistment",
  "enlisting",
  "national guard",
  "reserve",
] as const;

export const TITLE_NOISE_TERMS = ["mechanic", "medicine", "medical"] as const;

export type AdzunaRelevanceInput = {
  title: string;
  description: string;
  companyName: string;
};

export type AdzunaRelevanceResult = {
  score: number;
  relevant: boolean;
  reasons: string[];
  militaryRecruitment: boolean;
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

function scoreField(text: string, terms: readonly string[], points: number): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const term of terms) {
    if (!termMatches(text, term)) continue;
    score += points;
    reasons.push(`+ ${term}`);
    if (score >= points * 3) break;
  }
  return { score, reasons };
}

export function isMilitaryRecruitmentTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    MILITARY_RECRUITMENT_TERMS.some((kw) => lower.includes(kw)) ||
    TITLE_NOISE_TERMS.some((kw) => lower.includes(kw))
  );
}

export function scoreAdzunaJob(
  input: AdzunaRelevanceInput,
  options?: { intakeChannel?: string }
): AdzunaRelevanceResult {
  const title = input.title.trim();
  const description = input.description.trim();
  const companyName = input.companyName.trim();
  const combined = `${title}\n${description}\n${companyName}`;

  if (isMilitaryRecruitmentTitle(title)) {
    return {
      score: 0,
      relevant: false,
      reasons: ["Excluded: military recruitment / noise title"],
      militaryRecruitment: true,
    };
  }

  const titleStrong = scoreField(title, STRONG_RELEVANT_TERMS, 25);
  const descStrong = scoreField(description, STRONG_RELEVANT_TERMS, 18);
  const titleMedium = scoreField(title, MEDIUM_RELEVANT_TERMS, 10);
  const descMedium = scoreField(description, MEDIUM_RELEVANT_TERMS, 8);
  const companyStrong = scoreField(companyName, STRONG_RELEVANT_TERMS, 5);

  let score = Math.min(
    100,
    titleStrong.score +
      descStrong.score +
      titleMedium.score +
      descMedium.score +
      companyStrong.score
  );

  const titleHasStrong = STRONG_RELEVANT_TERMS.some((t) => termMatches(title, t));
  const bodyHasStrong =
    STRONG_RELEVANT_TERMS.some((t) => termMatches(description, t)) ||
    MEDIUM_RELEVANT_TERMS.some((t) => termMatches(description, t));

  const fromCompanyChannel = options?.intakeChannel?.startsWith("co:") ?? false;

  if (titleHasStrong) {
    score = Math.max(score, 75);
  } else if (bodyHasStrong) {
    score = Math.max(score, 55);
  } else if (fromCompanyChannel && termMatches(combined, "ordnance")) {
    score = Math.max(score, 50);
  }

  const threshold = fromCompanyChannel ? 45 : 50;
  const relevant = score >= threshold;

  const reasons = [
    ...titleStrong.reasons.map((r) => `${r} in title`),
    ...descStrong.reasons.map((r) => `${r} in description`),
    ...titleMedium.reasons.map((r) => `${r} in title`),
    ...descMedium.reasons.map((r) => `${r} in description`),
    ...companyStrong.reasons.map((r) => `${r} in company`),
  ].slice(0, 12);

  return {
    score,
    relevant,
    reasons,
    militaryRecruitment: false,
  };
}

export function detectAdzunaCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("uxo") || t.includes("unexploded ordnance")) return "UXO";
  if (t.includes("c-ied") || t.includes("cied") || t.includes("counter ied") || t.includes("improvised explosive"))
    return "C-IED";
  if (t.includes("cwmd") || t.includes("c-wmd") || t.includes("counter weapons of mass destruction"))
    return "CWMD";
  if (t.includes("wmd") || t.includes("weapons of mass destruction")) return "WMD";
  if (t.includes("uas") || t.includes("uav") || t.includes("unmanned aerial") || t.includes("drone"))
    return "UAS";
  if (t.includes("c-uas") || t.includes("counter uas") || t.includes("counter-uas")) return "C-UAS";
  if (t.includes("explosive safety") || t.includes("explosives specialist")) return "Explosive Safety";
  if (t.includes("direct action")) return "Direct Action EOD";
  if (t.includes("bomb squad") || t.includes("bomb tech")) return "Bomb Squad";
  if (t.includes("demining") || t.includes("mine action") || t.includes("hma")) return "HMA";
  if (t.includes("cbrn") || t.includes("cbrne")) return "CBRN";
  return "EOD";
}
