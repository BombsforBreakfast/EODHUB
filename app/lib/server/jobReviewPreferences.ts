import type { SupabaseClient } from "@supabase/supabase-js";
import { learnedJobSignals, type JobReviewFeedback, type JobReviewPreferences, type JobTypeExclusion } from "../jobReviewPreferences";

export async function loadJobTypeExclusions(client: SupabaseClient): Promise<JobTypeExclusion[]> {
  const rows: JobTypeExclusion[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from("job_type_exclusions").select("id,phrase").order("id").range(start, start + 499);
    if (error) throw new Error(`Could not load job type exclusions: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) return rows;
  }
}
export async function loadJobReviewPreferences(client: SupabaseClient): Promise<JobReviewPreferences> {
  const exclusions = await loadJobTypeExclusions(client);
  const feedback: JobReviewFeedback[] = [];
  // Bound the history used for ranking; durable listing memory is independent of this window.
  for (let start = 0; start < 2000; start += 500) {
    const { data, error } = await client.from("job_review_feedback").select("job_id,title,company_name,location,decision")
      .order("created_at", { ascending: false }).order("job_id").range(start, start + 499);
    if (error) throw new Error(`Could not load job review feedback: ${error.message}`);
    feedback.push(...(data ?? []) as JobReviewFeedback[]);
    if ((data ?? []).length < 500) break;
  }
  return { exclusions, signals: learnedJobSignals(feedback) };
}
