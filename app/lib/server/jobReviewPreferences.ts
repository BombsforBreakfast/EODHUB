import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobReviewPreferences, JobTypeExclusion } from "../jobReviewPreferences";
export async function loadJobTypeExclusions(client: SupabaseClient): Promise<JobTypeExclusion[]> {
  const rows:JobTypeExclusion[]=[];
  for(let start=0;;start+=500){const page=await client.from("job_type_exclusions").select("id,phrase").order("id").range(start,start+499);if(page.error)throw new Error("Could not load exact-title exclusions: "+page.error.message);rows.push(...(page.data??[]));if((page.data?.length??0)<500)return rows;}
}
export async function loadJobReviewPreferences(client: SupabaseClient): Promise<JobReviewPreferences> {
  const priorities: import("../jobMissionPriority").JobPriorityRule[] = [];
  for (let start = 0; ; start += 500) {
    const page = await client.from("job_priority_rules").select("id,job_id,phrase,mission_required,target_score").order("id").range(start, start + 499);
    if (page.error) throw new Error(`Could not load job priority rules: ${page.error.message}`);
    priorities.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 500) break;
  }
  return { exclusions: await loadJobTypeExclusions(client), signals: [], priorities };
}
