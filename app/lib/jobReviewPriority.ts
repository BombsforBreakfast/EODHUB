import { positiveJobSignals } from "./jobPositiveSignals";
import type { JobReviewPreferences } from "./jobReviewPreferences";
import {jobMissionPriority} from "./jobMissionPriority";
import type {JobGold} from "./jobHighlights";

export type JobReviewBand = "high" | "possible" | "low";
export type JobReviewFilter = JobReviewBand | "all" | "gold";
export type ReviewableJob = JobGold & { id: string; title?: string | null; company_name?: string | null; description?: string | null; og_description?: string | null; created_at?: string | null };
function clean(text: string): string {
  return text.normalize("NFKC").replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp);/gi, " ")
    .replace(/[\u2010-\u2015-]/g, " ").replace(/\s+/g, " ").trim();
}
export function scoreJobReview(job: ReviewableJob, preferences?: JobReviewPreferences) {
  const result = positiveJobSignals(job.title ?? "", job.description || job.og_description || "");
  const mission = jobMissionPriority(clean(job.title ?? ""), clean(job.description || job.og_description || ""), preferences?.priorities ?? [], job.id);
  const score = Math.max(job.gold_highlight ? 100 : 0, mission.score, result.score);
  return {
    score, band: (score >= 70 ? "high" : score >= 40 ? "possible" : "low") as JobReviewBand,
    reasons: [...(job.gold_highlight ? ["100: Manually selected Gold highlight"] : []), ...(mission.reason ? [mission.reason] : []), ...result.reasons, ...(score ? [] : ["No positive signal; retained for manual review"])],
    matchedKeywords: result.matchedKeywords,
  };
}
export function jobReviewPage<T extends ReviewableJob>(rows: T[], filter: JobReviewFilter, offset: number, limit: number, preferences?: JobReviewPreferences) {
  const counts = { high: 0, possible: 0, low: 0, all: rows.length, gold: rows.filter(job=>job.gold_highlight).length };
  const ranked = rows.map(job => {
    const review_priority = scoreJobReview(job, preferences);
    counts[review_priority.band]++;
    return { ...job, review_priority };
  }).filter(job => filter === "all" || (filter === "gold" ? job.gold_highlight : job.review_priority.band === filter))
    .sort((a, b) => b.review_priority.score - a.review_priority.score || (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id));
  return { jobs: ranked.slice(offset, offset + limit), totalCount: ranked.length, priorityCounts: counts };
}
