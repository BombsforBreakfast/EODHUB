import type { SupabaseClient } from "@supabase/supabase-js";
import { jobAutoApprovalReason, JOB_AUTO_APPROVAL_POLICY, type AutoApprovalJob } from "../jobAutoApproval";
import { jobListingCutoffIso } from "../jobRetention";
import { loadJobImportMemory, filterRememberedJobs } from "./jobImportMemory";
export type AutoApprovalRow = AutoApprovalJob & { id: string; title: string; company_name: string; location: string; apply_url: string | null; description: string; og_description: string | null };
export const AUTO_APPROVAL_COLUMNS = "id,title,company_name,location,apply_url,description,og_description,source_type,import_metadata";

/** Sweep only current imported pending rows. Failures leave listings in manual review. */
export async function autoApproveExplicitJobs(client: SupabaseClient, source?: string, errors?: string[]) {
  const memory = await loadJobImportMemory(client);
  const rows: AutoApprovalRow[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = client.from("jobs").select(AUTO_APPROVAL_COLUMNS).neq("is_rejected", true).neq("is_approved", true)
      .gte("created_at", jobListingCutoffIso()).in("source_type", ["adzuna", "usajobs", "linkedin", "reliefweb"]);
    if (source) query = query.eq("source_type", source);
    const { data, error } = await query.order("id").range(offset, offset + 499);
    if (error) throw new Error(`Could not read pending jobs for auto approval: ${error.message}`);
    rows.push(...(data ?? []) as AutoApprovalRow[]);
    if ((data ?? []).length < 500) break;
  }
  let approved = 0;
  for (const row of rows) {
    const reason = jobAutoApprovalReason(row, memory.exclusions);
    if (!reason) continue;
    const identity = { title: row.title, companyName: row.company_name, location: row.location, applyUrl: row.apply_url };
    // Protect rejected copies and avoid publishing duplicates of current approved jobs.
    const remembered = await filterRememberedJobs(client, [row], () => identity, memory);
    if (!remembered.candidates.length) continue;
    const { data, error } = await client.rpc("auto_approve_explicit_job", {
      target_job_id: row.id, expected_job: row, expected_exclusions: memory.exclusions,
      approval_reason: reason, policy_version: JOB_AUTO_APPROVAL_POLICY,
    });
    if (error) {
      if (!errors) throw new Error(`Could not auto approve job: ${error.message}`);
      errors.push(`[auto approval ${row.id}] ${error.message}`); continue;
    }
    if (data) { approved++; memory.rememberApproval(identity, row.id); }
  }
  return approved;
}

export async function autoApproveAfterImport(client: SupabaseClient, source: string, errors: string[]): Promise<number> {
  try { return await autoApproveExplicitJobs(client, source, errors); }
  catch (error) { errors.push(`[auto approval] ${error instanceof Error ? error.message : "Unavailable; eligible jobs remain pending"}`); return 0; }
}
