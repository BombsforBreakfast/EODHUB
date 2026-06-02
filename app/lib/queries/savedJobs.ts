import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryKeys } from "../queryKeys";

export const SAVED_JOBS_STALE_MS = 5 * 60_000;

export type SavedJobRow = {
  id: string;
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
  created_at: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

type RawSavedJob = {
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
  created_at: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

type RawSavedJobRow = {
  id: string;
  job_id: string;
  jobs: RawSavedJob | RawSavedJob[] | null;
};

export function mapSavedJobRow(row: RawSavedJobRow): SavedJobRow {
  const job = Array.isArray(row.jobs) ? row.jobs[0] ?? null : row.jobs;
  return {
    id: row.id,
    job_id: row.job_id,
    title: job?.title ?? null,
    company_name: job?.company_name ?? null,
    location: job?.location ?? null,
    category: job?.category ?? null,
    description: job?.description ?? null,
    apply_url: job?.apply_url ?? null,
    pay_min: job?.pay_min ?? null,
    pay_max: job?.pay_max ?? null,
    clearance: job?.clearance ?? null,
    source_type: job?.source_type ?? null,
    created_at: job?.created_at ?? null,
    og_title: job?.og_title ?? null,
    og_description: job?.og_description ?? null,
    og_image: job?.og_image ?? null,
    og_site_name: job?.og_site_name ?? null,
  };
}

export async function fetchSavedJobs(
  supabase: SupabaseClient,
  userId: string,
): Promise<SavedJobRow[]> {
  const { data, error } = await supabase
    .from("saved_jobs")
    .select(
      "id, job_id, jobs(title, company_name, location, category, description, apply_url, pay_min, pay_max, clearance, source_type, created_at, og_title, og_description, og_image, og_site_name)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawSavedJobRow[]).map(mapSavedJobRow);
}

export function savedJobIdsFromRows(rows: SavedJobRow[] | undefined): Set<string> {
  return new Set((rows ?? []).map((row) => row.job_id));
}

export function savedJobRowFromJob(job: {
  id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
  created_at?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_site_name?: string | null;
}): SavedJobRow {
  return {
    id: `optimistic:${job.id}`,
    job_id: job.id,
    title: job.title,
    company_name: job.company_name,
    location: job.location,
    category: job.category,
    description: job.description,
    apply_url: job.apply_url,
    pay_min: job.pay_min,
    pay_max: job.pay_max,
    clearance: job.clearance,
    source_type: job.source_type,
    created_at: job.created_at ?? null,
    og_title: job.og_title ?? null,
    og_description: job.og_description ?? null,
    og_image: job.og_image ?? null,
    og_site_name: job.og_site_name ?? null,
  };
}

export async function toggleSavedJob({
  queryClient,
  supabase,
  userId,
  jobId,
  saved,
  optimisticRow,
}: {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  userId: string;
  jobId: string;
  saved: boolean;
  optimisticRow?: SavedJobRow;
}): Promise<void> {
  const queryKey = queryKeys.savedJobs(userId);
  const previousRows = queryClient.getQueryData<SavedJobRow[]>(queryKey);

  if (previousRows || optimisticRow) {
    const rows = previousRows ?? [];
    queryClient.setQueryData<SavedJobRow[]>(
      queryKey,
      saved
        ? rows.filter((row) => row.job_id !== jobId)
        : rows.some((row) => row.job_id === jobId) || !optimisticRow
          ? rows
          : [optimisticRow, ...rows],
    );
  }

  try {
    if (saved) {
      const { error } = await supabase
        .from("saved_jobs")
        .delete()
        .eq("user_id", userId)
        .eq("job_id", jobId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("saved_jobs")
        .insert([{ user_id: userId, job_id: jobId }]);
      if (error) throw error;
    }
  } catch (error) {
    if (previousRows) queryClient.setQueryData(queryKey, previousRows);
    throw error;
  } finally {
    void queryClient.invalidateQueries({ queryKey });
  }
}
