import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  extractUSAJobsSummary,
  extractUSAJobsFullDescription,
  usajobsFilterData,
  fetchUSAJobsKeywordPage,
  fetchUSAJobsOrganizationPage,
  fetchUSAJobsSeriesPage,
  fetchUSAJobsTitlePage,
  type USAJobsApiItem,
} from "../../lib/usajobs/api";
import {
  USAJOBS_KEYWORD_CHANNELS,
  USAJOBS_ORGANIZATION_CHANNELS,
  USAJOBS_RESULTS_PER_PAGE,
  USAJOBS_SERIES_CHANNELS,
  USAJOBS_TITLE_CHANNELS,
} from "../../lib/usajobs/intakeConfig";
import { detectUSAJobsCategory, scoreUSAJobsJob } from "../../lib/usajobs/relevance";
import { canonicalUSAJobsUrl, usajobsUrlVariants } from "../../lib/usajobsJob";
import { jobListingCutoffIso } from "../../lib/jobRetention";
import {
  chunkArray,
  JOB_IMPORT_LOOKUP_CHUNK,
  JOB_IMPORT_WRITE_CHUNK,
} from "../../lib/jobImportBatch";

// Multi-channel intake issues many sequential USAJobs API calls; give the cron
// room to finish so DB writes/last_seen refresh aren't dropped to a timeout.
// 800s is the Pro + Fluid Compute ceiling (default without this is 300s).
export const runtime = "nodejs";
export const maxDuration = 800;

type USAJobCandidate = {
  fullDescription: string;
  filterData: ReturnType<typeof usajobsFilterData>;
  positionId: string;
  title: string;
  location: string;
  orgName: string;
  departmentName: string;
  summary: string;
  applyUrl: string;
  intakeChannel: string;
  relevanceScore: number;
};

function toCandidate(
  item: USAJobsApiItem,
  intakeChannel: string,
  relevanceScore: number
): USAJobCandidate | null {
  const pos = item.MatchedObjectDescriptor;
  // MatchedObjectId is the numeric control number used in job URLs; PositionID
  // is the agency announcement number (alphanumeric) and must not be used here.
  const positionId = item.MatchedObjectId?.trim();
  if (!positionId || !/^\d+$/.test(positionId)) return null;

  return {
    positionId,
    fullDescription: extractUSAJobsFullDescription(item),
    filterData: usajobsFilterData(item),
    title: pos.PositionTitle,
    location: pos.PositionLocationDisplay,
    orgName: pos.OrganizationName,
    departmentName: pos.DepartmentName ?? "",
    summary: extractUSAJobsSummary(item),
    applyUrl: canonicalUSAJobsUrl(positionId),
    intakeChannel,
    relevanceScore,
  };
}

function considerJob(
  item: USAJobsApiItem,
  intakeChannel: string,
  seenPositionIds: Set<string>,
  candidates: USAJobCandidate[]
): "added" | "duplicate" | "skipped" {
  const positionId = item.MatchedObjectId?.trim();
  if (!positionId || !/^\d+$/.test(positionId)) return "skipped";

  if (seenPositionIds.has(positionId)) return "duplicate";
  seenPositionIds.add(positionId);

  const pos = item.MatchedObjectDescriptor;
  const relevance = scoreUSAJobsJob(
    {
      title: pos.PositionTitle,
      description: extractUSAJobsSummary(item),
      organizationName: pos.OrganizationName,
      departmentName: pos.DepartmentName,
    },
    { intakeChannel }
  );

  if (!relevance.relevant) return "skipped";

  const candidate = toCandidate(item, intakeChannel, relevance.score);
  if (!candidate) return "skipped";

  candidates.push(candidate);
  return "added";
}

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

  if (!process.env.USAJOBS_API_KEY || !process.env.USAJOBS_EMAIL) {
    return NextResponse.json(
      { error: "USAJOBS_API_KEY and USAJOBS_EMAIL env vars are required" },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = jobListingCutoffIso();
  const { count: purged } = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("source_type", "usajobs")
    .neq("is_rejected", true)
    .lt("created_at", cutoff);

  const seenPositionIds = new Set<string>();
  const candidates: USAJobCandidate[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let apiCalls = 0;

  for (const channel of USAJOBS_KEYWORD_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { items, error } = await fetchUSAJobsKeywordPage(
        channel.keyword,
        page,
        channel.datePosted
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const item of items) {
        const result = considerJob(item, channel.id, seenPositionIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < USAJOBS_RESULTS_PER_PAGE) break;
    }
  }

  for (const channel of USAJOBS_SERIES_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { items, error } = await fetchUSAJobsSeriesPage(
        channel.jobCategoryCode,
        channel.keyword,
        page,
        channel.datePosted
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const item of items) {
        const result = considerJob(item, channel.id, seenPositionIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < USAJOBS_RESULTS_PER_PAGE) break;
    }
  }

  for (const channel of USAJOBS_ORGANIZATION_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { items, error } = await fetchUSAJobsOrganizationPage(
        channel.organization,
        channel.keyword,
        page,
        channel.datePosted
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const item of items) {
        const result = considerJob(item, channel.id, seenPositionIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < USAJOBS_RESULTS_PER_PAGE) break;
    }
  }

  for (const channel of USAJOBS_TITLE_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { items, error } = await fetchUSAJobsTitlePage(
        channel.positionTitle,
        page,
        channel.datePosted
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const item of items) {
        const result = considerJob(item, channel.id, seenPositionIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < USAJOBS_RESULTS_PER_PAGE) break;
    }
  }

  const lookupUrls = [...new Set(candidates.flatMap((c) => usajobsUrlVariants(c.positionId)))];
  const existingByPositionId = new Map<string, { id: string; is_rejected: boolean; description: string | null; import_metadata: Record<string, unknown> | null; pay_min: number | null; pay_max: number | null; clearance: string | null }>();

  for (const urlChunk of chunkArray(lookupUrls, JOB_IMPORT_LOOKUP_CHUNK)) {
    const { data, error: lookupErr } = await supabase
      .from("jobs")
      .select("id, apply_url, is_rejected, description, import_metadata, pay_min, pay_max, clearance")
      .eq("source_type", "usajobs")
      .in("apply_url", urlChunk);
    if (lookupErr) {
      errors.push(`[lookup usajobs batch] ${lookupErr.message}`);
      continue;
    }
    for (const row of data ?? []) {
      if (!row.apply_url) continue;
      const positionId =
        row.apply_url.match(/usajobs\.gov(?::\d+)?\/job\/(\d+)/i)?.[1] ??
        row.apply_url.match(/ViewDetails\/(\d+)/i)?.[1];
      if (positionId) {
        existingByPositionId.set(positionId, {
          ...row,
          id: row.id,
          is_rejected: row.is_rejected === true,
        });
      }
    }
  }

  let imported = 0;
  let refreshed = 0;
  const importedTitles: string[] = [];
  const refreshIds: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    const existing = existingByPositionId.get(candidate.positionId);
    if (existing) {
      if (existing.is_rejected) {
        skipped++;
        continue;
      }
      // Enrich unchanged imported descriptions; preserve manual edits.
      const enrichment: Record<string, unknown> = {
        last_seen_at: now,
        import_metadata: { ...existing.import_metadata, filter_source: candidate.filterData.filter_source },
      };
      if (!existing.description || candidate.fullDescription.startsWith(existing.description)) {
        enrichment.description = candidate.fullDescription;
        enrichment.og_description = candidate.fullDescription.slice(0, 500);
      }
      if (existing.pay_min == null) enrichment.pay_min = candidate.filterData.pay_min;
      if (existing.pay_max == null) enrichment.pay_max = candidate.filterData.pay_max;
      if (!existing.clearance) enrichment.clearance = candidate.filterData.clearance;
      const { error: enrichError } = await supabase.from("jobs").update(enrichment).eq("id", existing.id);
      if (enrichError) { errors.push(`[enrich usajobs] ${enrichError.message}`); continue; }
      refreshIds.push(existing.id);
      refreshed++;
      continue;
    }

    inserts.push({
      title: candidate.title,
      company_name: candidate.orgName,
      location: candidate.location,
      apply_url: candidate.applyUrl,
      description: candidate.fullDescription,
      og_description: candidate.fullDescription.slice(0, 500),
      pay_min: candidate.filterData.pay_min,
      pay_max: candidate.filterData.pay_max,
      clearance: candidate.filterData.clearance,
      og_site_name: "USAJobs.gov",
      category: detectUSAJobsCategory(candidate.title, candidate.summary),
      relevance_score: candidate.relevanceScore,
      import_metadata: {
        intake_channel: candidate.intakeChannel,
        relevance_score: candidate.relevanceScore,
        usajobs_position_id: candidate.positionId,
        filter_source: candidate.filterData.filter_source,
      },
      is_approved: false,
      source_type: "usajobs",
      last_seen_at: now,
    });
    importedTitles.push(candidate.title);
  }

  for (const insertChunk of chunkArray(inserts, JOB_IMPORT_WRITE_CHUNK)) {
    const { error: insErr } = await supabase.from("jobs").insert(insertChunk);
    if (insErr) {
      errors.push(`[insert usajobs batch] ${insErr.message}`);
      continue;
    }
    imported += insertChunk.length;
  }

  for (const idChunk of chunkArray(refreshIds, JOB_IMPORT_LOOKUP_CHUNK)) {
    const { error: upErr } = await supabase
      .from("jobs")
      .update({ last_seen_at: now })
      .in("id", idChunk);
    if (upErr) {
      errors.push(`[refresh usajobs batch] ${upErr.message}`);
    }
  }

  return NextResponse.json({
    imported,
    refreshed,
    purged: purged ?? 0,
    skipped,
    candidates: candidates.length,
    apiCalls,
    keywordChannels: USAJOBS_KEYWORD_CHANNELS.length,
    seriesChannels: USAJOBS_SERIES_CHANNELS.length,
    organizationChannels: USAJOBS_ORGANIZATION_CHANNELS.length,
    titleChannels: USAJOBS_TITLE_CHANNELS.length,
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}
