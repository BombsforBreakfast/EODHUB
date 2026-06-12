import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchAdzunaCategoryPage,
  fetchAdzunaCompanyPage,
  fetchAdzunaKeywordPage,
  roundAdzunaSalary,
  type AdzunaApiJob,
} from "../../lib/adzuna/api";
import {
  ADZUNA_CATEGORY_CHANNELS,
  ADZUNA_COMPANY_CHANNELS,
  ADZUNA_KEYWORD_CHANNELS,
  ADZUNA_RESULTS_PER_PAGE,
} from "../../lib/adzuna/intakeConfig";
import { detectAdzunaCategory, scoreAdzunaJob } from "../../lib/adzuna/relevance";
import { canonicalAdzunaDetailsUrl, parseAdzunaAdIdFromUrl } from "../../lib/adzunaJob";
import { jobListingCutoffIso } from "../../lib/jobRetention";
import {
  chunkArray,
  JOB_IMPORT_LOOKUP_CHUNK,
  JOB_IMPORT_WRITE_CHUNK,
} from "../../lib/jobImportBatch";

type AdzunaCandidate = {
  adId: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  applyUrl: string;
  payMin: number | null;
  payMax: number | null;
  intakeChannel: string;
  relevanceScore: number;
};

function toCandidate(job: AdzunaApiJob, intakeChannel: string, relevanceScore: number): AdzunaCandidate | null {
  const adId = parseAdzunaAdIdFromUrl(job.redirect_url) ?? String(job.id);
  if (!/^\d+$/.test(adId)) return null;

  return {
    adId,
    title: job.title,
    companyName: job.company.display_name,
    location: job.location.display_name,
    description: job.description,
    applyUrl: canonicalAdzunaDetailsUrl(adId),
    payMin: roundAdzunaSalary(job.salary_min),
    payMax: roundAdzunaSalary(job.salary_max),
    intakeChannel,
    relevanceScore,
  };
}

function considerJob(
  job: AdzunaApiJob,
  intakeChannel: string,
  seenAdzunaIds: Set<string>,
  candidates: AdzunaCandidate[]
): "added" | "duplicate" | "skipped" {
  const adId = parseAdzunaAdIdFromUrl(job.redirect_url) ?? String(job.id);
  if (!/^\d+$/.test(adId)) return "skipped";

  if (seenAdzunaIds.has(adId)) return "duplicate";
  seenAdzunaIds.add(adId);

  const relevance = scoreAdzunaJob(
    {
      title: job.title,
      description: job.description,
      companyName: job.company.display_name,
    },
    { intakeChannel }
  );

  if (!relevance.relevant) return "skipped";

  const candidate = toCandidate(job, intakeChannel, relevance.score);
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

  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    return NextResponse.json(
      { error: "ADZUNA_APP_ID and ADZUNA_APP_KEY env vars are required" },
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
    .eq("source_type", "adzuna")
    .neq("is_rejected", true)
    .lt("created_at", cutoff);

  const seenAdzunaIds = new Set<string>();
  const candidates: AdzunaCandidate[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let apiCalls = 0;

  for (const channel of ADZUNA_KEYWORD_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { jobs: items, error } = await fetchAdzunaKeywordPage(
        channel.what,
        page,
        channel.maxDaysOld
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const job of items) {
        const result = considerJob(job, channel.id, seenAdzunaIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < ADZUNA_RESULTS_PER_PAGE) break;
    }
  }

  for (const channel of ADZUNA_COMPANY_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { jobs: items, error } = await fetchAdzunaCompanyPage(
        channel.company,
        channel.what,
        page,
        channel.maxDaysOld
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const job of items) {
        const result = considerJob(job, channel.id, seenAdzunaIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < ADZUNA_RESULTS_PER_PAGE) break;
    }
  }

  for (const channel of ADZUNA_CATEGORY_CHANNELS) {
    for (let page = 1; page <= channel.maxPages; page++) {
      const { jobs: items, error } = await fetchAdzunaCategoryPage(
        channel.category,
        channel.what,
        page,
        channel.maxDaysOld
      );
      apiCalls++;
      if (error) {
        errors.push(`[${channel.id} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const job of items) {
        const result = considerJob(job, channel.id, seenAdzunaIds, candidates);
        if (result === "skipped") skipped++;
        else if (result === "duplicate") skipped++;
      }

      if (items.length < ADZUNA_RESULTS_PER_PAGE) break;
    }
  }

  const adIds = candidates.map((c) => c.adId);
  const existingByAdId = new Map<
    string,
    { id: string; is_rejected: boolean; is_approved: boolean | null }
  >();

  for (const idChunk of chunkArray(adIds, JOB_IMPORT_LOOKUP_CHUNK)) {
    const { data, error: lookupErr } = await supabase
      .from("jobs")
      .select("id, adzuna_ad_id, is_rejected, is_approved")
      .eq("source_type", "adzuna")
      .in("adzuna_ad_id", idChunk);
    if (lookupErr) {
      errors.push(`[lookup adzuna batch] ${lookupErr.message}`);
      continue;
    }
    for (const row of data ?? []) {
      if (row.adzuna_ad_id) {
        existingByAdId.set(row.adzuna_ad_id, {
          id: row.id,
          is_rejected: row.is_rejected === true,
          is_approved: row.is_approved ?? null,
        });
      }
    }
  }

  let imported = 0;
  let refreshed = 0;
  const importedTitles: string[] = [];
  const now = new Date().toISOString();
  const upsertRows: Record<string, unknown>[] = [];

  for (const candidate of candidates) {
    const existing = existingByAdId.get(candidate.adId);
    if (existing?.is_rejected) {
      skipped++;
      continue;
    }

    if (existing) refreshed++;
    else {
      imported++;
      importedTitles.push(candidate.title);
    }

    upsertRows.push({
      title: candidate.title,
      company_name: candidate.companyName,
      location: candidate.location,
      apply_url: candidate.applyUrl,
      adzuna_ad_id: candidate.adId,
      description: candidate.description,
      og_description: candidate.description,
      og_site_name: "Adzuna",
      pay_min: candidate.payMin,
      pay_max: candidate.payMax,
      category: detectAdzunaCategory(candidate.title),
      relevance_score: candidate.relevanceScore,
      import_metadata: {
        intake_channel: candidate.intakeChannel,
        relevance_score: candidate.relevanceScore,
      },
      is_approved: existing?.is_approved ?? false,
      source_type: "adzuna",
      last_seen_at: now,
    });
  }

  for (const upsertChunk of chunkArray(upsertRows, JOB_IMPORT_WRITE_CHUNK)) {
    const { error: upsertErr } = await supabase
      .from("jobs")
      .upsert(upsertChunk, { onConflict: "adzuna_ad_id" });
    if (upsertErr) {
      errors.push(`[upsert adzuna batch] ${upsertErr.message}`);
    }
  }

  return NextResponse.json({
    imported,
    refreshed,
    purged: purged ?? 0,
    skipped,
    candidates: candidates.length,
    apiCalls,
    keywordChannels: ADZUNA_KEYWORD_CHANNELS.length,
    companyChannels: ADZUNA_COMPANY_CHANNELS.length,
    categoryChannels: ADZUNA_CATEGORY_CHANNELS.length,
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}
