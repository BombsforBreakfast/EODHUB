import { positiveJobSignals } from "../jobPositiveSignals";
import { adzunaIndexedPhrase } from "./intakeConfig";

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
  "navscoleod",
  "nseod",
  "soae",
  "ordnance safety",
  "explosives safety",
  "cooperative threat reduction",
  "strategic offensive arms elimination",
  "counter explosive hazard",
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

export function isMilitaryRecruitmentTitle(_title: string): boolean { return false; }
export function scoreAdzunaJob(input: AdzunaRelevanceInput, _options?: { intakeChannel?: string }): AdzunaRelevanceResult {
  const result = positiveJobSignals(input.title, input.description);
  return { score: result.score, reasons: result.reasons, relevant: true, militaryRecruitment: false };
}

export function detectAdzunaCategory(title: string, description = "", intakeChannel = ""): string {
  const t = title.toLowerCase();
  if (t.includes("uxo") || t.includes("unexploded ordnance")) return "UXO";
  if (t.includes("c-ied") || t.includes("cied") || t.includes("counter ied") || t.includes("improvised explosive"))
    return "C-IED";
  if (
    t.includes("cwmd") ||
    t.includes("c-wmd") ||
    t.includes("counter weapons of mass destruction") ||
    t.includes("wmd") ||
    t.includes("weapons of mass destruction") ||
    t.includes("strategic offensive arms elimination") ||
    t.includes("cooperative threat reduction") ||
    /\bsoae\b/.test(t)
  ) {
    return "CWMD";
  }
  if (t.includes("uas") || t.includes("uav") || t.includes("unmanned aerial") || t.includes("drone"))
    return "UAS";
  if (t.includes("c-uas") || t.includes("counter uas") || t.includes("counter-uas")) return "C-UAS";
  if (t.includes("explosive safety") || t.includes("explosives safety") || t.includes("ordnance safety") || t.includes("explosives specialist")) return "Explosive Safety";
  if (t.includes("direct action")) return "Direct Action EOD";
  if (t.includes("bomb squad") || t.includes("bomb tech")) return "Bomb Squad";
  if (t.includes("demining") || t.includes("mine action") || t.includes("hma")) return "HMA";
  if (t.includes("cbrn") || t.includes("cbrne")) return "CBRN";
  if (!STRONG_RELEVANT_TERMS.some(term => termMatches(title, term))) {
    const context = description + " " + (adzunaIndexedPhrase(intakeChannel) ?? "");
    if (["cwmd", "c-wmd", "weapons of mass destruction", "cooperative threat reduction", "strategic offensive arms elimination"].some(term => termMatches(context, term))) return "CWMD";
    if (["explosive safety", "explosives safety", "ordnance safety"].some(term => termMatches(context, term))) return "Explosive Safety";
    if (["unexploded ordnance", "uxo"].some(term => termMatches(context, term))) return "UXO";
  }
  return "EOD";
}

