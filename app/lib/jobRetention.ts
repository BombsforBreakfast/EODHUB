/** Approved job listings expire after this many days (listed date = created_at). */
export const JOB_MAX_AGE_DAYS = 30;

export function jobListingCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isJobListingExpired(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  return createdMs < nowMs - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
