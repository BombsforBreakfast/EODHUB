/**
 * USAJobs relevance — title, description, and organization (not title-only).
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
  "cied",
  "c-ied",
  "counter-ied",
  "counter ied",
  "improvised explosive",
  "disposal",
  "ammunition",
  "munitions",
  "tss-e",
  "transportation security specialist",
  "cbrn",
  "cbrne",
  "uas",
  "unmanned aerial",
  "cuas",
  "counter-uas",
  "counter uas",
  "c-uas",
  "emergency management specialist",
  "nuclear materials courier",
  "render safe",
  "pyrotechnic",
  "blasting",
] as const;

export const MEDIUM_RELEVANT_TERMS = [
  "explosive",
  "ordnance technician",
  "ammunition technician",
  "emergency management",
  "emergency preparedness",
  "continuity of operations",
  "disaster response",
  "hazmat",
  "hazardous materials",
  "range safety",
  "nuclear",
  "chemical",
  "radiological",
  "wmd",
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
  "title 32",
] as const;

export const TITLE_NOISE_TERMS = ["mechanic", "medicine", "medical", "inspector"] as const;

export type USAJobsRelevanceInput = {
  title: string;
  description: string;
  organizationName: string;
  departmentName?: string;
};

export type USAJobsRelevanceResult = {
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

export function scoreUSAJobsJob(
  input: USAJobsRelevanceInput,
  options?: { intakeChannel?: string }
): USAJobsRelevanceResult {
  const title = input.title.trim();
  const description = input.description.trim();
  const orgName = input.organizationName.trim();
  const department = (input.departmentName ?? "").trim();
  const combined = `${title}\n${description}\n${orgName}\n${department}`;

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
  const orgStrong = scoreField(`${orgName} ${department}`, STRONG_RELEVANT_TERMS, 5);

  let score = Math.min(
    100,
    titleStrong.score + descStrong.score + titleMedium.score + descMedium.score + orgStrong.score
  );

  const titleHasStrong = STRONG_RELEVANT_TERMS.some((t) => termMatches(title, t));
  const bodyHasStrong =
    STRONG_RELEVANT_TERMS.some((t) => termMatches(description, t)) ||
    MEDIUM_RELEVANT_TERMS.some((t) => termMatches(description, t));

  const channel = options?.intakeChannel ?? "";
  const fromSeriesChannel = channel.startsWith("series:");
  const fromOrgChannel = channel.startsWith("org:");
  const fromTitleChannel = channel.startsWith("title:");

  if (titleHasStrong) {
    score = Math.max(score, 75);
  } else if (bodyHasStrong) {
    score = Math.max(score, 55);
  } else if ((fromSeriesChannel || fromOrgChannel || fromTitleChannel) && termMatches(combined, "ordnance")) {
    score = Math.max(score, 50);
  } else if (fromTitleChannel && termMatches(combined, "emergency management")) {
    score = Math.max(score, 50);
  }

  const threshold =
    fromSeriesChannel || fromOrgChannel || fromTitleChannel ? 45 : 50;
  const relevant = score >= threshold;

  const reasons = [
    ...titleStrong.reasons.map((r) => `${r} in title`),
    ...descStrong.reasons.map((r) => `${r} in description`),
    ...titleMedium.reasons.map((r) => `${r} in title`),
    ...descMedium.reasons.map((r) => `${r} in description`),
    ...orgStrong.reasons.map((r) => `${r} in org`),
  ].slice(0, 12);

  return {
    score,
    relevant,
    reasons,
    militaryRecruitment: false,
  };
}

export function detectUSAJobsCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("uxo") || t.includes("unexploded ordnance")) return "UXO";
  if (t.includes("uas") || t.includes("uav") || t.includes("unmanned aerial") || t.includes("drone"))
    return "UAS";
  if (t.includes("bomb squad") || t.includes("bomb tech")) return "Bomb Squad";
  if (t.includes("emergency management") || t.includes("em specialist")) return "EM";
  if (t.includes("cbrn") || t.includes("cbrne") || t.includes("wmd")) return "CBRN";
  if (t.includes("nuclear materials courier")) return "NMC";
  return "EOD";
}
