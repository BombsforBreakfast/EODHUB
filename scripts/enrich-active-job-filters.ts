/** Existing approved inventory only: no inserts, approvals, rejection changes or
 * retention deletes. Default is a dry run. Supply JOB_ENRICHMENT_ENV_FILE locally
 * or configured server credentials, and --apply for reviewed enrichment.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { adzunaFilterSource, fetchAdzunaJobs, type AdzunaApiJob } from "../app/lib/adzuna/api";
import type { AdzunaCountryCode } from "../app/lib/adzuna/intakeConfig";
import { fetchUSAJobsSearch, extractUSAJobsFullDescription, usajobsFilterData, type USAJobsApiItem } from "../app/lib/usajobs/api";
import { jobListingCutoffIso } from "../app/lib/jobRetention";
if (process.env.JOB_ENRICHMENT_ENV_FILE) process.loadEnvFile(process.env.JOB_ENRICHMENT_ENV_FILE);
const apply = process.argv.includes("--apply");
const auditPath = process.argv.find(v => v.startsWith("--audit="))?.slice(8);
const reusePath = process.argv.find(v => v.startsWith("--reuse="))?.slice(8);
const reuseOnly = process.argv.includes("--reuse-only");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type Row = { id: string; title: string; company_name?: string | null; apply_url: string; source_type: string; description: string | null; pay_min: number | null; pay_max: number | null; clearance: string | null; import_metadata: Record<string, unknown> | null };
async function main() {
  if (apply && !auditPath) throw Error("--audit=path is required with --apply to save the previous values before changing them");
  const cutoff = jobListingCutoffIso();
  const { data, error } = await admin.from("jobs").select("id,title,company_name,apply_url,source_type,description,pay_min,pay_max,clearance,import_metadata")
    .eq("is_approved", true).neq("is_rejected", true).gte("created_at", cutoff).in("source_type", ["adzuna", "usajobs"])
    .order("id").limit(1000);
  if (error) throw error;
  if (data?.length === 1000) throw Error("Enrichment batch is full; narrow the scope before applying");
  const adzunaCache = new Map<string, AdzunaApiJob[]>();
  const usaCache = new Map<string, USAJobsApiItem[]>();
  const changes: { id: string; before: Row; patch: Record<string, unknown> }[] = [];
  const previous = reusePath ? JSON.parse(await readFile(reusePath, "utf8")) as { changes: typeof changes } : null;
  const previousById = new Map((previous?.changes ?? []).map(c => [c.id, c]));
  const allowedColumns = new Set(["import_metadata", "description", "og_description", "pay_min", "pay_max", "clearance"]);
  let unmatched = 0, apiCalls = 0, errors = 0;
  for (const row of (data ?? []) as Row[]) {
    let patch: Record<string, unknown> | null = null;
    const metadata = row.import_metadata ?? {};
    const reused = previousById.get(row.id);
    if (reused && (["title", "description", "pay_min", "pay_max", "clearance", "import_metadata"] as const).every(key => JSON.stringify(reused.before[key]) === JSON.stringify(row[key]))) {
      if (Object.keys(reused.patch).some(key => !allowedColumns.has(key))) throw Error("Audit contains out-of-scope columns");
      changes.push({ id: row.id, before: row, patch: reused.patch });
      continue;
    }
    if (reuseOnly) { unmatched++; continue; }
    if (row.source_type === "adzuna") {
      const country = String(metadata.adzuna_country ?? "us") as AdzunaCountryCode;
      if (!["us", "gb", "au", "ca", "za"].includes(country)) { unmatched++; continue; }
      const key = `${country}:${row.title}:${row.company_name ?? ""}`;
      if (!adzunaCache.has(key)) {
        const result = await fetchAdzunaJobs({ country, what: row.title, page: 1, resultsPerPage: 50, maxDaysOld: 365 });
        apiCalls++;
        if (result.error) { errors++; adzunaCache.set(key, []); } else adzunaCache.set(key, result.jobs);
      }
      const id = row.apply_url.match(/(?:details\/|land\/ad\/)(\d+)/)?.[1];
      const raw = adzunaCache.get(key)?.find(j => String(j.id) === id);
      if (raw) patch = { import_metadata: { ...metadata, filter_source: adzunaFilterSource(raw, country) } };
    } else {
      const key = row.title;
      if (!usaCache.has(key)) {
        const result = await fetchUSAJobsSearch({ positionTitle: key, page: 1, resultsPerPage: 500, datePosted: null });
        apiCalls++;
        if (result.error) { errors++; usaCache.set(key, []); } else usaCache.set(key, result.items);
      }
      const id = row.apply_url.match(/(?:job\/|ViewDetails\/)(\d+)/i)?.[1];
      const raw = usaCache.get(key)?.find(j => j.MatchedObjectId === id);
      if (raw) {
        const details = usajobsFilterData(raw);
        patch = { import_metadata: { ...metadata, filter_source: details.filter_source } };
        const full = extractUSAJobsFullDescription(raw);
        if (!row.description || full.startsWith(row.description)) { patch.description = full; patch.og_description = full.slice(0, 500); }
        if (row.pay_min == null) patch.pay_min = details.pay_min;
        if (row.pay_max == null) patch.pay_max = details.pay_max;
        if (!row.clearance) patch.clearance = details.clearance;
      }
    }
    if (patch) changes.push({ id: row.id, before: row, patch }); else unmatched++;
    if (apiCalls % 20 === 0) console.log(JSON.stringify({ progress: true, apiCalls, matched: changes.length, unmatched, errors }));
    if (errors >= 3) throw Error("Three source request errors; stopped without applying any changes");
  }
  if (auditPath) await writeFile(auditPath, JSON.stringify({ cutoff, apply, changes }, null, 2));
  let updated = 0;
  if (apply) for (const change of changes) {
    // Compare metadata to avoid overwriting a concurrent importer refresh.
    let update = admin.from("jobs").update(change.patch).eq("id", change.id).eq("is_approved", true).neq("is_rejected", true);
    update = change.before.import_metadata === null ? update.is("import_metadata", null) : update.filter("import_metadata", "eq", JSON.stringify(change.before.import_metadata));
    for (const key of ["description", "pay_min", "pay_max", "clearance"] as const) if (key in change.patch) {
      update = change.before[key] === null ? update.is(key, null) : update.eq(key, change.before[key]);
    }
    const { data: saved, error: updateError } = await update.select("id");
    if (updateError) throw updateError;
    updated += saved?.length ?? 0;
  }
  console.log(JSON.stringify({ apply, activeImportedJobs: data?.length ?? 0, matched: changes.length, updated, unmatched, errors, apiCalls, descriptionsExpanded: changes.filter(c => typeof c.patch.description === "string" && c.patch.description.length > (c.before.description?.length ?? 0)).length }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
