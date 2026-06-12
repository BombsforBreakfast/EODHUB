import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  buildImportMetadata,
  detectCategory,
  fetchReliefWebJobsBatch,
  fetchReliefWebJobsBySourceQuery,
  fetchReliefWebJobsByTheme,
  formatReliefWebFilterDate,
  LOOKBACK_DAYS,
  MAX_PAGES_PER_BATCH,
  normalizeReliefWebJob,
  RELIEFWEB_KEYWORD_BATCHES,
  RELIEFWEB_SOURCE_INTAKE_CHANNELS,
  RELIEFWEB_THEME_INTAKE_CHANNELS,
  RESULTS_PER_PAGE,
  scoreReliefWebJob,
  shouldIngestReliefWebJob,
} from "../app/lib/reliefwebJob";
import { jobListingCutoffIso } from "../app/lib/jobRetention";

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
if (!url || !key || !appName) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
const mode = process.argv[2] ?? "import";

if (mode === "purge-pending") {
  const { count, error } = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("source_type", "reliefweb")
    .eq("is_approved", false);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(JSON.stringify({ deletedPendingReliefweb: count ?? 0 }, null, 2));
  process.exit(0);
}

if (mode === "score-samples") {
  const samples = [
    { title: "Humanitarian Mine Action Operations Manager", description: "Lead UXO clearance and demining teams.", metadataText: "UNMAS Syria Mine Action" },
    { title: "Country Director - Burkina Faso", description: "Oversee nutrition, WASH, and logistics programmes.", metadataText: "Danish Refugee Council Burkina Faso" },
    { title: "Security Advisor", description: "Support operations and security risk management.", metadataText: "International NGO" },
    { title: "EOD Technical Advisor", description: "Explosive ordnance disposal training and QA.", metadataText: "HALO Trust Ukraine Mine Action" },
  ];
  for (const s of samples) {
    console.log(JSON.stringify({ ...s, ...scoreReliefWebJob(s) }, null, 2));
  }
  process.exit(0);
}

function mergeImportMetadata(
  existing: Record<string, unknown>,
  incoming: ReturnType<typeof buildImportMetadata>
) {
  const prevQ = Array.isArray(existing.matched_queries) ? (existing.matched_queries as string[]) : [];
  const prevR = Array.isArray(existing.relevance_reasons) ? (existing.relevance_reasons as string[]) : [];
  const qSet = new Set([...prevQ, ...incoming.matched_queries]);
  const rSet = new Set([...prevR, ...incoming.relevance_reasons]);
  return {
    ...existing,
    ...incoming,
    matched_queries: [...qSet],
    relevance_reasons: [...rSet],
  };
}

const cutoff = jobListingCutoffIso();
const { count: purged } = await supabase
  .from("jobs")
  .delete({ count: "exact" })
  .eq("source_type", "reliefweb")
  .neq("is_rejected", true)
  .lt("created_at", cutoff);

const createdAfter = formatReliefWebFilterDate(
  new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
);

const seenReliefWebIds = new Set<string>();
let imported = 0;
let refreshed = 0;
let skipped = 0;
let suppressed = 0;
let high = 0;
let possible = 0;
let low = 0;
let apiCalls = 0;
const importedTitles: string[] = [];
const errors: string[] = [];

for (const queryBatch of RELIEFWEB_KEYWORD_BATCHES) {
  try {
    for (let page = 0; page < MAX_PAGES_PER_BATCH; page++) {
      const offset = page * RESULTS_PER_PAGE;
      const { jobs: items, error } = await fetchReliefWebJobsBatch(
        queryBatch,
        offset,
        appName,
        createdAfter
      );
      apiCalls++;
      if (error) {
        errors.push(`[${queryBatch.slice(0, 40)} offset ${offset}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const raw of items) {
        const normalized = normalizeReliefWebJob(raw);
        if (!normalized) {
          skipped++;
          continue;
        }
        const rwId = normalized.reliefwebJobId;
        if (seenReliefWebIds.has(rwId)) {
          skipped++;
          continue;
        }
        seenReliefWebIds.add(rwId);

        const relevance = scoreReliefWebJob({
          title: normalized.title,
          description: normalized.description,
          metadataText: normalized.metadataText,
          themes: normalized.themes,
        });

        if (
          relevance.excluded ||
          !shouldIngestReliefWebJob(
            relevance.score,
            normalized.title,
            normalized.description,
            normalized.metadataText
          )
        ) {
          skipped++;
          continue;
        }

        const { data: existing, error: selectErr } = await supabase
          .from("jobs")
          .select("id, is_rejected, import_metadata")
          .eq("source_type", "reliefweb")
          .eq("reliefweb_job_id", rwId)
          .maybeSingle();

        if (selectErr) {
          errors.push(`[select ${rwId}] ${selectErr.message}`);
          continue;
        }

        if (relevance.confidence === "high") high++;
        else if (relevance.confidence === "possible") possible++;
        else low++;
        if (relevance.suppressed) suppressed++;

        if (relevance.suppressed && !existing) {
          skipped++;
          continue;
        }

        const importMetadata = buildImportMetadata(normalized, relevance, queryBatch);
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
          import_metadata: existing?.import_metadata
            ? mergeImportMetadata(existing.import_metadata as Record<string, unknown>, importMetadata)
            : importMetadata,
          last_seen_at: now,
        };

        if (existing) {
          if (existing.is_rejected) {
            skipped++;
            continue;
          }
          const { error: upErr } = await supabase.from("jobs").update(rowPayload).eq("id", existing.id);
          if (upErr) {
            errors.push(`[update ${rwId}] ${upErr.message}`);
            continue;
          }
          refreshed++;
          continue;
        }

        const { error: insErr } = await supabase.from("jobs").insert({
          ...rowPayload,
          reliefweb_job_id: rwId,
          is_approved: false,
          source_type: "reliefweb",
        });
        if (insErr) {
          errors.push(`[insert ${rwId}] ${insErr.message}`);
          continue;
        }
        imported++;
        importedTitles.push(normalized.title);
      }

      if (items.length < RESULTS_PER_PAGE) break;
    }
  } catch (e) {
    errors.push(`[batch] ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function ingestReliefWebItems(
  items: Awaited<ReturnType<typeof fetchReliefWebJobsBatch>>["jobs"],
  matchedQuery: string
) {
  for (const raw of items) {
    const normalized = normalizeReliefWebJob(raw);
    if (!normalized) {
      skipped++;
      continue;
    }
    const rwId = normalized.reliefwebJobId;
    if (seenReliefWebIds.has(rwId)) {
      skipped++;
      continue;
    }
    seenReliefWebIds.add(rwId);

    const relevance = scoreReliefWebJob({
      title: normalized.title,
      description: normalized.description,
      metadataText: normalized.metadataText,
      themes: normalized.themes,
    });

    if (
      relevance.excluded ||
      !shouldIngestReliefWebJob(
        relevance.score,
        normalized.title,
        normalized.description,
        normalized.metadataText
      )
    ) {
      skipped++;
      continue;
    }

    const { data: existing, error: selectErr } = await supabase
      .from("jobs")
      .select("id, is_rejected, import_metadata")
      .eq("source_type", "reliefweb")
      .eq("reliefweb_job_id", rwId)
      .maybeSingle();

    if (selectErr) {
      errors.push(`[select ${rwId}] ${selectErr.message}`);
      continue;
    }

    if (relevance.confidence === "high") high++;
    else if (relevance.confidence === "possible") possible++;
    else low++;
    if (relevance.suppressed) suppressed++;

    if (relevance.suppressed && !existing) {
      skipped++;
      continue;
    }

    const importMetadata = buildImportMetadata(normalized, relevance, matchedQuery);
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
      import_metadata: existing?.import_metadata
        ? mergeImportMetadata(existing.import_metadata as Record<string, unknown>, importMetadata)
        : importMetadata,
      last_seen_at: now,
    };

    if (existing) {
      if (existing.is_rejected) {
        skipped++;
        continue;
      }
      const { error: upErr } = await supabase.from("jobs").update(rowPayload).eq("id", existing.id);
      if (upErr) {
        errors.push(`[update ${rwId}] ${upErr.message}`);
        continue;
      }
      refreshed++;
      continue;
    }

    const { error: insErr } = await supabase.from("jobs").insert({
      ...rowPayload,
      reliefweb_job_id: rwId,
      is_approved: false,
      source_type: "reliefweb",
    });
    if (insErr) {
      errors.push(`[insert ${rwId}] ${insErr.message}`);
      continue;
    }
    imported++;
    importedTitles.push(normalized.title);
  }
}

for (const channel of RELIEFWEB_THEME_INTAKE_CHANNELS) {
  const channelAfter = formatReliefWebFilterDate(
    new Date(Date.now() - channel.lookbackDays * 24 * 60 * 60 * 1000)
  );
  try {
    for (let page = 0; page < channel.maxPages; page++) {
      const offset = page * RESULTS_PER_PAGE;
      const { jobs: items, error } = await fetchReliefWebJobsByTheme(
        channel.themeId,
        offset,
        appName,
        channelAfter
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} offset ${offset}] ${error}`);
        break;
      }
      if (items.length === 0) break;
      await ingestReliefWebItems(items, channel.id);
      if (items.length < RESULTS_PER_PAGE) break;
    }
  } catch (e) {
    errors.push(`[${channel.id}] ${e instanceof Error ? e.message : String(e)}`);
  }
}

for (const channel of RELIEFWEB_SOURCE_INTAKE_CHANNELS) {
  const channelAfter = formatReliefWebFilterDate(
    new Date(Date.now() - channel.lookbackDays * 24 * 60 * 60 * 1000)
  );
  try {
    for (let page = 0; page < channel.maxPages; page++) {
      const offset = page * RESULTS_PER_PAGE;
      const { jobs: items, error } = await fetchReliefWebJobsBySourceQuery(
        channel.query,
        offset,
        appName,
        channelAfter
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} offset ${offset}] ${error}`);
        break;
      }
      if (items.length === 0) break;
      await ingestReliefWebItems(items, channel.id);
      if (items.length < RESULTS_PER_PAGE) break;
    }
  } catch (e) {
    errors.push(`[${channel.id}] ${e instanceof Error ? e.message : String(e)}`);
  }
}

const { count: pendingCount } = await supabase
  .from("jobs")
  .select("id", { count: "exact", head: true })
  .eq("source_type", "reliefweb")
  .eq("is_approved", false);

console.log(
  JSON.stringify(
    {
      imported,
      refreshed,
      purged: purged ?? 0,
      skipped,
      suppressed,
      confidence: { high, possible, low },
      apiCalls,
      keywordBatches: RELIEFWEB_KEYWORD_BATCHES.length,
      pendingReliefweb: pendingCount ?? 0,
      sample: importedTitles.slice(0, 15),
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
