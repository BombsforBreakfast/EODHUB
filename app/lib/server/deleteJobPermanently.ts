import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hard-delete a job and dependent member rows. Stale flags cascade via FK.
 * Saved jobs are removed explicitly in case the FK lacks ON DELETE CASCADE.
 */
export async function deleteJobPermanently(
  adminClient: SupabaseClient,
  jobId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: savedErr } = await adminClient.from("saved_jobs").delete().eq("job_id", jobId);
  if (savedErr) {
    return { ok: false, error: savedErr.message };
  }

  const { error: jobErr } = await adminClient.from("jobs").delete().eq("id", jobId);
  if (jobErr) {
    return { ok: false, error: jobErr.message };
  }

  return { ok: true };
}
