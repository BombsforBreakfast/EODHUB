import type { SupabaseClient } from "@supabase/supabase-js";
import { jobListingCutoffIso } from "../jobRetention";

export const JOBS_LIST_STALE_MS = 10 * 60_000;

const JOBS_PAGE_COLUMNS =
  "id, created_at, title, category, location, pay_min, pay_max, clearance, description, apply_url, company_name, source_type, og_title, og_description, og_image, og_site_name";

/**
 * Approved, non-expired jobs for the full /jobs listing. Read-only; safe to
 * cache and share across remounts (10 min stale).
 */
export async function fetchApprovedJobs<T>(
  supabase: SupabaseClient,
  limit: number,
  cutoff: string,
): Promise<T[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOBS_PAGE_COLUMNS)
    .eq("is_approved", true)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as T[];
}

export { jobListingCutoffIso };
