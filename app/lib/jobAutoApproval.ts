import { jobImportExclusionReason } from "./jobImportExclusions";
import { excludedJobType, type JobTypeExclusion } from "./jobReviewPreferences";
import { isReliefWebJobSuppressed } from "./reliefweb/publicVisibility";
export const JOB_AUTO_APPROVAL_POLICY = "explicit-ordnance-title-v1";
export type AutoApprovalJob = { title?: string | null; company_name?: string | null; source_type?: string | null; import_metadata?: Record<string, unknown> | null };
/** Title-only policy. A matching description, employer, EOD acronym, or learned score is never enough. */
export function jobAutoApprovalReason(job: AutoApprovalJob, exclusions: JobTypeExclusion[] = []): string | null {
  const title = (job.title ?? "").normalize("NFKC").replace(/&(?:nbsp|#160);/gi, " ").replace(/\s+/g, " ").trim();
  if (jobImportExclusionReason(title, job.company_name ?? "") || excludedJobType(title, exclusions)) return null;
  const meta = job.import_metadata;
  if (isReliefWebJobSuppressed(job.source_type, { suppressed: meta?.suppressed === true, relevance_confidence: meta?.relevance_confidence === "low" ? "low" : undefined })) return null;
  if (/\b(?:portfolio|including|various roles|multiple (?:roles|disciplines))\b/i.test(title)) return null;
  if (/\bexplosive ordnance disposal\b/i.test(title)) return "Explosive Ordnance Disposal in job title";
  if (/\buxo\b|\bunexploded ordnance\b/i.test(title)) return "UXO / Unexploded Ordnance in job title";
  return null;
}
