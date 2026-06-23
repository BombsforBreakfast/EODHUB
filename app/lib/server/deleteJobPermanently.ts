import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingSavedJobsTable(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    (message.includes("saved_jobs") && message.includes("does not exist"))
  );
}

/**
 * Hard-delete a job and dependent member rows. Stale flags cascade via FK.
 * saved_jobs is cleaned up when present; skipped when the table is absent.
 */
export async function deleteJobPermanently(
  adminClient: SupabaseClient,
  jobId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: savedErr } = await adminClient.from("saved_jobs").delete().eq("job_id", jobId);
  if (savedErr && !isMissingSavedJobsTable(savedErr)) {
    return { ok: false, error: savedErr.message };
  }

  const { error: jobErr } = await adminClient.from("jobs").delete().eq("id", jobId);
  if (jobErr) {
    return { ok: false, error: jobErr.message };
  }

  return { ok: true };
}
