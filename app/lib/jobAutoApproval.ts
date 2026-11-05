import type { JobTypeExclusion } from "./jobReviewPreferences";
export const JOB_AUTO_APPROVAL_POLICY = "manual-review-only";
export type AutoApprovalJob = { title?: string | null; company_name?: string | null; source_type?: string | null; import_metadata?: Record<string, unknown> | null };
export function jobAutoApprovalReason(_job: AutoApprovalJob, _exclusions: JobTypeExclusion[] = []): string | null { return null; }
