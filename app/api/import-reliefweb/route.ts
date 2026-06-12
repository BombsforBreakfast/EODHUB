import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildImportMetadata,
  detectCategory,
  fetchReliefWebJobsBatch,
  fetchReliefWebJobsByIds,
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
} from "../../lib/reliefwebJob";
import { TARGET_RELIEFWEB_JOB_IDS } from "../../lib/reliefweb/targetJobIds";
import { jobListingCutoffIso } from "../../lib/jobRetention";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  const authorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && querySecret === cronSecret);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appName = process.env.RELIEFWEB_APP_NAME?.trim();
  if (!appName) {
    return NextResponse.json({
      skippedRun: true,
      reason: "RELIEFWEB_APP_NAME not configured",
      imported: 0,
      refreshed: 0,
      skipped: 0,
      purged: 0,
      apiCalls: 0,
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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
          errors.push(`[${queryBatch.slice(0, 40)}… offset ${offset}] ${error}`);
          break;
        }
        if (items.length === 0) break;

        for (const raw of items) {
          const result = await ingestReliefWebRawJob(
            supabase,
            raw,
            queryBatch,
            seenReliefWebIds,
            importedTitles,
            errors
          );
          if (result === "imported") imported++;
          else if (result === "refreshed") refreshed++;
          else if (result === "suppressed") suppressed++;
          else skipped++;
        }

        if (items.length < RESULTS_PER_PAGE) break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[batch ${queryBatch.slice(0, 30)}…] ${msg}`);
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

        for (const raw of items) {
          const result = await ingestReliefWebRawJob(
            supabase,
            raw,
            channel.id,
            seenReliefWebIds,
            importedTitles,
            errors
          );
          if (result === "imported") imported++;
          else if (result === "refreshed") refreshed++;
          else if (result === "suppressed") suppressed++;
          else skipped++;
        }

        if (items.length < RESULTS_PER_PAGE) break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${channel.id}] ${msg}`);
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

        for (const raw of items) {
          const result = await ingestReliefWebRawJob(
            supabase,
            raw,
            channel.id,
            seenReliefWebIds,
            importedTitles,
            errors
          );
          if (result === "imported") imported++;
          else if (result === "refreshed") refreshed++;
          else if (result === "suppressed") suppressed++;
          else skipped++;
        }

        if (items.length < RESULTS_PER_PAGE) break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${channel.id}] ${msg}`);
    }
  }

  const missingTargetIds = TARGET_RELIEFWEB_JOB_IDS.filter((id) => !seenReliefWebIds.has(id));
  if (missingTargetIds.length > 0) {
    const { jobs: targetItems, error: targetErr } = await fetchReliefWebJobsByIds(
      missingTargetIds,
      appName
    );
    apiCalls++;
    if (targetErr) {
      errors.push(`[target job ids] ${targetErr}`);
    } else {
      for (const raw of targetItems) {
        const result = await ingestReliefWebRawJob(
          supabase,
          raw,
          "targeted:eod-hma-cied-uas",
          seenReliefWebIds,
          importedTitles,
          errors
        );
        if (result === "imported") imported++;
        else if (result === "refreshed") refreshed++;
        else if (result === "suppressed") suppressed++;
        else skipped++;
      }
    }
  }

  return NextResponse.json({
    imported,
    refreshed,
    purged: purged ?? 0,
    skipped,
    suppressed,
    apiCalls,
    keywordBatches: RELIEFWEB_KEYWORD_BATCHES.length,
    themeChannels: RELIEFWEB_THEME_INTAKE_CHANNELS.length,
    sourceChannels: RELIEFWEB_SOURCE_INTAKE_CHANNELS.length,
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}

type IngestResult = "imported" | "refreshed" | "skipped" | "suppressed";

async function ingestReliefWebRawJob(
  supabase: SupabaseClient,
  raw: Parameters<typeof normalizeReliefWebJob>[0],
  matchedQuery: string,
  seenReliefWebIds: Set<string>,
  importedTitles: string[],
  errors: string[]
): Promise<IngestResult> {
  const normalized = normalizeReliefWebJob(raw);
  if (!normalized) return "skipped";

  const rwId = normalized.reliefwebJobId;
  if (seenReliefWebIds.has(rwId)) return "skipped";
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
    return "skipped";
  }

  const { data: existing, error: selectErr } = await supabase
    .from("jobs")
    .select("id, is_rejected, import_metadata")
    .eq("source_type", "reliefweb")
    .eq("reliefweb_job_id", rwId)
    .maybeSingle();

  if (selectErr) {
    errors.push(`[select reliefweb ${rwId}] ${selectErr.message}`);
    return "skipped";
  }

  if (relevance.suppressed && !existing) return "suppressed";

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
    if (existing.is_rejected) return "skipped";
    const { error: upErr } = await supabase.from("jobs").update(rowPayload).eq("id", existing.id);
    if (upErr) {
      errors.push(`[update reliefweb ${rwId}] ${upErr.message}`);
      return "skipped";
    }
    return "refreshed";
  }

  const { error: insErr } = await supabase.from("jobs").insert({
    ...rowPayload,
    reliefweb_job_id: rwId,
    is_approved: false,
    source_type: "reliefweb",
  });

  if (insErr) {
    errors.push(`[insert reliefweb ${rwId}] ${insErr.message}`);
    return "skipped";
  }
  importedTitles.push(normalized.title);
  return "imported";
}

function mergeImportMetadata(
  existing: Record<string, unknown>,
  incoming: ReturnType<typeof buildImportMetadata>
): Record<string, unknown> {
  const prevQ = Array.isArray(existing.matched_queries)
    ? (existing.matched_queries as string[])
    : [];
  const prevR = Array.isArray(existing.relevance_reasons)
    ? (existing.relevance_reasons as string[])
    : [];
  const qSet = new Set([...prevQ, ...incoming.matched_queries]);
  const rSet = new Set([...prevR, ...incoming.relevance_reasons]);
  return {
    ...existing,
    ...incoming,
    matched_queries: [...qSet],
    relevance_reasons: [...rSet],
  };
}
