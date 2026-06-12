/**
 * Cross-reference focused ReliefWeb EOD/HMA/CIED/UAS listings against Supabase
 * and insert rows that are not already present.
 *
 * Usage:
 *   npx tsx scripts/crossref-reliefweb-targeted.ts           # import new only
 *   npx tsx scripts/crossref-reliefweb-targeted.ts --dry-run # report only
 *   npx tsx scripts/crossref-reliefweb-targeted.ts --refresh  # update existing matches too
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RELIEFWEB_APP_NAME
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  buildImportMetadata,
  detectCategory,
  fetchReliefWebJobsByIds,
  normalizeReliefWebJob,
  scoreReliefWebJob,
  shouldIngestReliefWebJob,
} from "../app/lib/reliefwebJob";
import {
  findReliefWebDuplicate,
  type ExistingJobRef,
} from "../app/lib/reliefweb/dedupeJob";
import { TARGET_RELIEFWEB_JOB_IDS } from "../app/lib/reliefweb/targetJobIds";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appName = process.env.RELIEFWEB_APP_NAME?.trim() ?? "";

const dryRun = process.argv.includes("--dry-run");
const refresh = process.argv.includes("--refresh");

if (!url || !key || !appName) {
  console.error(
    "Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RELIEFWEB_APP_NAME"
  );
  process.exit(1);
}

const supabase = createClient(url, key);

const MATCHED_QUERY = "targeted:eod-hma-cied-uas-search";

function mergeImportMetadata(
  existing: Record<string, unknown>,
  incoming: ReturnType<typeof buildImportMetadata>
) {
  const prevQ = Array.isArray(existing.matched_queries) ? (existing.matched_queries as string[]) : [];
  const prevR = Array.isArray(existing.relevance_reasons) ? (existing.relevance_reasons as string[]) : [];
  return {
    ...existing,
    ...incoming,
    matched_queries: [...new Set([...prevQ, ...incoming.matched_queries])],
    relevance_reasons: [...new Set([...prevR, ...incoming.relevance_reasons])],
  };
}

async function loadExistingJobs(): Promise<ExistingJobRef[]> {
  const rows: ExistingJobRef[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, reliefweb_job_id, apply_url, title, company_name, is_rejected, source_type")
      .or("source_type.eq.reliefweb,source_type.is.null,source_type.neq.reliefweb")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as ExistingJobRef[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const existingJobs = await loadExistingJobs();
  const reliefwebExisting = existingJobs.filter((j) => j.reliefweb_job_id);

  const { jobs: rawJobs, error: fetchErr } = await fetchReliefWebJobsByIds(
    TARGET_RELIEFWEB_JOB_IDS,
    appName
  );
  if (fetchErr) {
    console.error("ReliefWeb API error:", fetchErr);
    process.exit(1);
  }

  const fetchedIds = new Set(rawJobs.map((j) => String(j.id)));
  const missingFromApi = TARGET_RELIEFWEB_JOB_IDS.filter((id) => !fetchedIds.has(id));

  let imported = 0;
  let refreshed = 0;
  let skippedDuplicate = 0;
  let skippedRejected = 0;
  let skippedLowRelevance = 0;
  let skippedSuppressed = 0;
  const report: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const raw of rawJobs) {
    const normalized = normalizeReliefWebJob(raw);
    if (!normalized) continue;

    const relevance = scoreReliefWebJob({
      title: normalized.title,
      description: normalized.description,
      metadataText: normalized.metadataText,
      themes: normalized.themes,
    });

    const duplicate = findReliefWebDuplicate(existingJobs, {
      reliefwebJobId: normalized.reliefwebJobId,
      applyUrl: normalized.applyUrl,
      title: normalized.title,
      companyName: normalized.companyName,
    });

    const entry: Record<string, unknown> = {
      reliefweb_job_id: normalized.reliefwebJobId,
      title: normalized.title,
      company: normalized.companyName,
      location: normalized.location,
      apply_url: normalized.applyUrl,
      relevance_score: relevance.score,
      confidence: relevance.confidence,
      duplicate: duplicate
        ? { id: duplicate.existing.id, reason: duplicate.reason }
        : null,
    };

    if (
      relevance.excluded ||
      !shouldIngestReliefWebJob(
        relevance.score,
        normalized.title,
        normalized.description,
        normalized.metadataText
      )
    ) {
      entry.action = "skip_low_relevance";
      skippedLowRelevance++;
      report.push(entry);
      continue;
    }

    if (relevance.suppressed && !duplicate) {
      entry.action = "skip_suppressed";
      skippedSuppressed++;
      report.push(entry);
      continue;
    }

    const importMetadata = buildImportMetadata(normalized, relevance, MATCHED_QUERY);
    const now = new Date().toISOString();
    const category = detectCategory(normalized.title);
    const rowPayload = {
      title: normalized.title,
      company_name: normalized.companyName,
      location: normalized.location,
      apply_url: normalized.applyUrl,
      description: normalized.description,
      og_description: normalized.description.slice(0, 500) || null,
      og_site_name: "ReliefWeb",
      category,
      relevance_score: relevance.score,
      import_metadata: importMetadata,
      last_seen_at: now,
    };

    if (duplicate) {
      if (duplicate.existing.is_rejected) {
        entry.action = "skip_rejected";
        skippedRejected++;
        report.push(entry);
        continue;
      }

      if (!refresh) {
        entry.action = "skip_duplicate";
        skippedDuplicate++;
        report.push(entry);
        continue;
      }

      entry.action = dryRun ? "would_refresh" : "refresh";
      if (!dryRun) {
        const { data: row } = await supabase
          .from("jobs")
          .select("import_metadata")
          .eq("id", duplicate.existing.id)
          .maybeSingle();

        const { error: upErr } = await supabase
          .from("jobs")
          .update({
            ...rowPayload,
            reliefweb_job_id: normalized.reliefwebJobId,
            import_metadata: row?.import_metadata
              ? mergeImportMetadata(row.import_metadata as Record<string, unknown>, importMetadata)
              : importMetadata,
          })
          .eq("id", duplicate.existing.id);

        if (upErr) errors.push(`[update ${normalized.reliefwebJobId}] ${upErr.message}`);
        else refreshed++;
      } else {
        refreshed++;
      }
      report.push(entry);
      continue;
    }

    entry.action = dryRun ? "would_import" : "import";
    if (!dryRun) {
      const { error: insErr } = await supabase.from("jobs").insert({
        ...rowPayload,
        reliefweb_job_id: normalized.reliefwebJobId,
        is_approved: false,
        source_type: "reliefweb",
      });
      if (insErr) errors.push(`[insert ${normalized.reliefwebJobId}] ${insErr.message}`);
      else imported++;
    } else {
      imported++;
    }
    report.push(entry);
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : refresh ? "import+refresh" : "import",
        target_ids: TARGET_RELIEFWEB_JOB_IDS.length,
        fetched_from_api: rawJobs.length,
        missing_from_api: missingFromApi,
        existing_reliefweb_rows: reliefwebExisting.length,
        imported,
        refreshed,
        skipped_duplicate: skippedDuplicate,
        skipped_rejected: skippedRejected,
        skipped_low_relevance: skippedLowRelevance,
        skipped_suppressed: skippedSuppressed,
        jobs: report,
        errors: errors.length ? errors : undefined,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
