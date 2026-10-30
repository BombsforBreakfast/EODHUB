import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteJobPermanently } from "./deleteJobPermanently";

const IMPORTED_SOURCES = new Set(["adzuna", "usajobs", "linkedin", "reliefweb"]);

function missingTable(error: { code?: string; message?: string }, table: string): boolean {
  return error.code === "PGRST205" || error.code === "42P01" ||
    !!(error.message?.includes(table) && error.message.includes("does not exist"));
}

/** Remove the listing and member references, retaining its source identity as hidden import memory. */
export async function removeJobWithImportMemory(
  adminClient: SupabaseClient,
  jobId: string,
  options: { pendingOnly?: boolean; notRelevant?: boolean; expectedTitle?: string } = {},
): Promise<{ ok: true; skipped?: true } | { ok: false; error: string }> {
  const { data: job, error: readError } = await adminClient.from("jobs")
    .select("id, source_type, is_approved, title").eq("id", jobId).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!job) return { ok: true };
  if (options.pendingOnly && job.is_approved) return { ok: true, skipped: true };
  if (options.expectedTitle !== undefined && job.title !== options.expectedTitle) return { ok: true, skipped: true };
  if (options.notRelevant) {
    const { data, error } = await adminClient.rpc("record_job_review_decision", { target_job_id: jobId, review_decision: "not_relevant", pending_only: options.pendingOnly ?? false });
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: true, skipped: true };
  }
  if (!IMPORTED_SOURCES.has(job.source_type ?? "")) {
    return deleteJobPermanently(adminClient, jobId);
  }

  // Persist the rejection first: a cleanup failure must never erase import memory.
  // All four importers already skip rejected source IDs and preserve these rows.
  let update = adminClient.from("jobs").update({ is_rejected: true, is_approved: false }).eq("id", jobId);
  if (options.pendingOnly) update = update.neq("is_approved", true);
  if (options.expectedTitle !== undefined) update = update.eq("title", options.expectedTitle);
  const { data: removed, error: updateError } = await update.select("id").maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!removed) return options.pendingOnly ? { ok: true, skipped: true } : { ok: false, error: "The job changed before removal. Refresh and try again." };

  // A retained rejection does not fire the hard-delete cascades.
  for (const table of ["saved_jobs", "job_stale_flags", "job_applications"]) {
    const { error } = await adminClient.from(table).delete().eq("job_id", jobId);
    if (error && !missingTable(error, table)) return { ok: false, error: error.message };
  }
  return { ok: true };
}
