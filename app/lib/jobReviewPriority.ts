import { jobImportExclusionReason } from "./jobImportExclusions";
import { jobDegreePenalty } from "./jobDegreeRequirements";
import { excludedJobType, learnedJobAdjustment, type JobReviewPreferences } from "./jobReviewPreferences";

export type JobReviewBand = "high" | "possible" | "low";
export type JobReviewFilter = JobReviewBand | "all";
export type ReviewableJob = { id: string; title?: string | null; company_name?: string | null; description?: string | null; og_description?: string | null; created_at?: string | null };
const families: Array<{ label: string; pattern: RegExp }> = [
  { label: "EOD", pattern: /\b(?:eod|explosive ordnance disposal)\b/i },
  { label: "UXO", pattern: /\b(?:uxo|unexploded ordnance)\b/i },
  { label: "IED / C-IED", pattern: /\b(?:ieds?|iedd|cied|c ied|counter ied|improvised explosive devices?)\b/i },
  { label: "CBRN / CBRNE", pattern: /\bcbrne?\b/i },
  { label: "CWMD / WMD", pattern: /\b(?:cwmd|c wmd|wmd|counter weapons of mass destruction|weapons of mass destruction)\b/i },
  { label: "UAS / drone", pattern: /\b(?:uas|uav|cuas|c uas|counter uas|drones?|unmanned aerial(?: systems?| vehicles?)?)\b/i },
  { label: "Mine action", pattern: /\b(?:mine action|humanitarian mine action|hma|demining|deminers?|mine clearance|explosive ordnance risk education|eore)\b/i },
  { label: "Explosives / ordnance", pattern: /\b(?:explosives?|ordnance)\b/i },
];
function clean(text: string): string {
  return text.normalize("NFKC").replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp);/gi, " ")
    .replace(/[\u2010-\u2015-]/g, " ").replace(/\s+/g, " ").trim();
}
function hits(text: string): string[] {
  const found = families.filter(family => family.pattern.test(text)).map(family => family.label);
  // Do not award the same explosive/ordnance phrase twice under its generic wording.
  return found.some(label => ["EOD", "UXO", "IED / C-IED", "Mine action"].includes(label))
    ? found.filter(label => label !== "Explosives / ordnance") : found;
}
export function scoreJobReview(job: ReviewableJob, preferences?: JobReviewPreferences) {
  const excluded = jobImportExclusionReason(job.title ?? "", job.company_name ?? "") || excludedJobType(job.title ?? "", preferences?.exclusions ?? [])?.phrase;
  if (excluded) return { score: 0, band: "low" as JobReviewBand, reasons: [`Excluded: ${excluded}`], matchedKeywords: [] as string[] };
  const title = hits(clean(job.title ?? ""));
  const body = hits(clean(job.description || job.og_description || ""));
  const baseScore = title.length ? Math.min(100, 70 + Math.min(10, (title.length - 1) * 5) + (body.length ? 15 : 0))
    : body.length ? Math.min(60, 40 + (body.length - 1) * 5) : 0;
  const degree = jobDegreePenalty([job.description, job.og_description].filter(Boolean).join("\n"));
  const learning = learnedJobAdjustment(job.title ?? "", preferences?.signals ?? []);
  const score = Math.max(0, Math.min(title.length ? 100 : 69, baseScore - degree.points + learning.points));
  return {
    score, band: (score >= 70 ? "high" : score >= 40 ? "possible" : "low") as JobReviewBand,
    reasons: [...(degree.reason ? [degree.reason] : []), ...(learning.reason ? [learning.reason] : []), ...title.map(term => `${term} in title`), ...body.map(term => `${term} in description`), ...(!title.length && body.length ? ["Description-only match; confirm the actual duties"] : []), ...(!title.length && !body.length ? ["No priority keyword in the returned title or description"] : [])],
    matchedKeywords: [...new Set([...title, ...body])],
  };
}
export function jobReviewPage<T extends ReviewableJob>(rows: T[], filter: JobReviewFilter, offset: number, limit: number, preferences?: JobReviewPreferences) {
  const counts = { high: 0, possible: 0, low: 0, all: rows.length };
  const ranked = rows.map(job => {
    const review_priority = scoreJobReview(job, preferences);
    counts[review_priority.band]++;
    return { ...job, review_priority };
  }).filter(job => filter === "all" || job.review_priority.band === filter)
    .sort((a, b) => b.review_priority.score - a.review_priority.score || (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id));
  return { jobs: ranked.slice(offset, offset + limit), totalCount: ranked.length, priorityCounts: counts };
}
