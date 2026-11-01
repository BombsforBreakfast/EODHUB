import type { SupabaseClient } from "@supabase/supabase-js";
import { jobListingCutoffIso } from "../jobRetention";

export const JOBS_LIST_STALE_MS = 10 * 60_000;

const JOBS_PAGE_COLUMNS =
  "id, created_at, title, category, location, pay_min, pay_max, clearance, description, apply_url, company_name, source_type, gold_highlight, gold_tags, gold_revision, gold_updated_at, applications_under_review, og_title, og_description, og_image, og_site_name, poc_name, poc_email, poc_phone, filter_overrides, filter_source:import_metadata->filter_source, import_country:import_metadata->>adzuna_country, description_is_excerpt:import_metadata->description_is_excerpt";

/**
 * Approved, non-expired jobs for the full /jobs listing. Read-only; safe to
 * cache and share across remounts (10 min stale).
 */
export async function fetchApprovedJobs<T>(
  supabase: SupabaseClient,
  limit: number,
  cutoff: string,
): Promise<T[]> {
  // limit=0 means the complete active board. Page through the API row limit;
  // never silently filter only the latest 500 rows. Keep feed-strip limits.
  const rows: T[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total && (limit === 0 || offset < limit)) {
    const size = limit === 0 ? 250 : Math.min(250, limit - offset);
    const { data, error, count } = await supabase.from("jobs")
      .select(JOBS_PAGE_COLUMNS, { count: "exact" })
      .eq("is_approved", true).neq("is_rejected", true).gte("created_at", cutoff)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + size - 1);
    if (error) throw error;
    if (count !== null) total = count;
    if (!data?.length) break;
    for (const row of data) {
      const source = row.filter_source && typeof row.filter_source === "object" ? row.filter_source : {};
      rows.push({ ...row, filter_source: { country: row.import_country, descriptionIsExcerpt: row.description_is_excerpt, ...source } } as T);
    }
    offset += data.length;
    if (count === null && data.length < size) break;
  }
  return rows;
}

export type JobBoardStats = {
  totalApprovedCount: number | null;
  newTodayCount: number | null;
};

/** Approved job totals for board headers (side rail + /jobs mobile). */
export async function fetchJobBoardStats(
  supabase: SupabaseClient,
  cutoff: string,
): Promise<JobBoardStats> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfNextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [totalRes, todayRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", true)
      .neq("is_rejected", true)
      .gte("created_at", cutoff),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", true)
      .neq("is_rejected", true)
      .gte("created_at", cutoff)
      .gte("created_at", startOfDay.toISOString())
      .lt("created_at", startOfNextDay.toISOString()),
  ]);

  return {
    totalApprovedCount: totalRes.error ? null : (totalRes.count ?? 0),
    newTodayCount: todayRes.error ? null : (todayRes.count ?? 0),
  };
}

export { jobListingCutoffIso };
