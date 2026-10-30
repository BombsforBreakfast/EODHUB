import type { SupabaseClient } from "@supabase/supabase-js";
import { jobListingCutoffIso } from "../jobRetention";
import { chunkArray, JOB_IMPORT_WRITE_CHUNK } from "../jobImportBatch";
import { excludedJobType, type JobTypeExclusion } from "../jobReviewPreferences";
import { loadJobTypeExclusions } from "./jobReviewPreferences";

export type JobMemoryIdentity = {
  title: string;
  companyName: string;
  location?: string | null;
  applyUrl?: string | null;
};
export type JobMemoryRow = {
  id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  apply_url: string | null;
  is_approved: boolean | null;
  is_rejected: boolean | null;
  created_at: string;
};

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function jobMemoryKeys(job: JobMemoryIdentity): string[] {
  const keys: string[] = [];
  const title = normalized(job.title);
  const company = normalized(job.companyName);
  const location = normalized(job.location ?? "");
  // Require all three: a generic title or employer alone must not block a new role.
  if (title && company && location) keys.push(`role:${JSON.stringify([title, company, location])}`);
  if (job.applyUrl) {
    try {
      const url = new URL(job.applyUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return keys;
      url.hash = "";
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      for (const key of [...url.searchParams.keys()]) {
        if (/^(?:utm_|trk$|tracking|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
      }
      url.searchParams.sort();
      const genericPage = /^\/(?:jobs?|careers?|search)?(?:\/search)?$/i.test(url.pathname);
      const hasJobId = [...url.searchParams.keys()].some(key => /^(?:job_?id|requisition_?id|req_?id|gh_jid)$/i.test(key));
      if (!genericPage || hasJobId) keys.push(`url:${url.toString()}`);
    } catch { /* An invalid URL can still match an exact title/employer/location. */ }
  }
  return keys;
}

export class JobImportMemory {
  private readonly decisions = new Map<string, { id: string; rejected: boolean }>();
  private readonly pending = new Map<string, Set<string>>();
  readonly refreshedIds = new Set<string>();
  readonly retiredIds = new Set<string>();

  constructor(rows: JobMemoryRow[], nowMs = Date.now(), readonly exclusions: JobTypeExclusion[] = []) {
    const cutoff = jobListingCutoffIso(nowMs);
    for (const row of rows) {
      const keys = jobMemoryKeys({ title: row.title ?? "", companyName: row.company_name ?? "", location: row.location, applyUrl: row.apply_url });
      if (!row.is_rejected && !row.is_approved) {
        for (const key of keys) {
          const ids = this.pending.get(key) ?? new Set<string>();
          ids.add(row.id);
          this.pending.set(key, ids);
        }
        continue;
      }
      if (!row.is_rejected && !(row.is_approved && row.created_at >= cutoff)) continue;
      for (const key of keys) {
        if (!this.decisions.get(key)?.rejected) this.decisions.set(key, { id: row.id, rejected: row.is_rejected === true });
      }
    }
  }

  match(identity: JobMemoryIdentity): { id: string; rejected: boolean } | undefined {
    const matches = jobMemoryKeys(identity).flatMap(key => this.decisions.has(key) ? [this.decisions.get(key)!] : []);
    return matches.find(match => match.rejected) ?? matches[0];
  }

  rememberApproval(identity: JobMemoryIdentity, id: string): void {
    for (const key of jobMemoryKeys(identity)) {
      if (!this.decisions.get(key)?.rejected) this.decisions.set(key, { id, rejected: false });
    }
  }

  pendingDuplicateIds(identity: JobMemoryIdentity): string[] {
    return [...new Set(jobMemoryKeys(identity).flatMap(key => [...(this.pending.get(key) ?? [])]))]
      .filter(id => !this.retiredIds.has(id));
  }
}

export async function loadJobImportMemory(client: SupabaseClient): Promise<JobImportMemory> {
  const rows: JobMemoryRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("jobs")
      .select("id,title,company_name,location,apply_url,is_approved,is_rejected,created_at")
      .or(`is_rejected.eq.true,and(is_approved.eq.true,created_at.gte.${jobListingCutoffIso()}),is_approved.eq.false`)
      .order("id").range(offset, offset + 499);
    if (error) throw new Error(`Could not load job import memory: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }
  return new JobImportMemory(rows, Date.now(), await loadJobTypeExclusions(client));
}

/** Keep approved listings published and deleted listings hidden, even across changed source IDs. */
export async function filterRememberedJobs<T>(
  client: SupabaseClient,
  candidates: T[],
  identity: (candidate: T) => JobMemoryIdentity,
  memory?: JobImportMemory,
): Promise<{ candidates: T[]; skipped: number; refreshed: number }> {
  if (!candidates.length) return { candidates, skipped: 0, refreshed: 0 };
  const state = memory ?? await loadJobImportMemory(client);
  const retained: T[] = [];
  const refreshIds = new Set<string>();
  const duplicateIds = new Set<string>();
  let skipped = 0;
  for (const candidate of candidates) {
    const candidateIdentity = identity(candidate);
    if (excludedJobType(candidateIdentity.title, state.exclusions)) { skipped++; continue; }
    const match = state.match(candidateIdentity);
    if (!match) retained.push(candidate);
    else {
      for (const id of state.pendingDuplicateIds(candidateIdentity)) duplicateIds.add(id);
      if (match.rejected) skipped++;
      else if (!state.refreshedIds.has(match.id)) refreshIds.add(match.id);
    }
  }
  // Retire queued copies too. Database guards preserve jobs approved since the read.
  // These copies do not become permanent rejections: the original decision remains authoritative.
  for (const ids of chunkArray([...duplicateIds], JOB_IMPORT_WRITE_CHUNK)) {
    const { data, error } = await client.from("jobs").delete().in("id", ids)
      .neq("is_approved", true).neq("is_rejected", true).select("id");
    if (error) throw new Error(`Could not retire queued job duplicates: ${error.message}`);
    const removedIds = (data ?? []).map(row => row.id as string);
    for (const id of removedIds) state.retiredIds.add(id);
    if (removedIds.length) {
      const { error: savedError } = await client.from("saved_jobs").delete().in("job_id", removedIds);
      if (savedError && savedError.code !== "PGRST205" && savedError.code !== "42P01") {
        throw new Error(`Could not clear duplicate saved jobs: ${savedError.message}`);
      }
    }
  }
  let refreshed = 0;
  for (const ids of chunkArray([...refreshIds], JOB_IMPORT_WRITE_CHUNK)) {
    const { data, error } = await client.from("jobs").update({ last_seen_at: new Date().toISOString() })
      .in("id", ids).eq("is_approved", true).neq("is_rejected", true).select("id");
    if (error) throw new Error(`Could not refresh approved job memory: ${error.message}`);
    for (const id of ids) state.refreshedIds.add(id);
    refreshed += (data ?? []).length;
  }
  return { candidates: retained, skipped, refreshed };
}
