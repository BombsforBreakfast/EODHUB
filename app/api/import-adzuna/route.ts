import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jobListingCutoffIso } from "../../lib/jobRetention";
import {
  canonicalAdzunaDetailsUrl,
  parseAdzunaAdIdFromUrl,
} from "../../lib/adzunaJob";
import {
  chunkArray,
  JOB_IMPORT_LOOKUP_CHUNK,
  JOB_IMPORT_WRITE_CHUNK,
} from "../../lib/jobImportBatch";

const EOD_KEYWORDS = [
  "explosive ordnance disposal",
  "UXO technician",
  "unexploded ordnance",
  "bomb technician",
  "CBRN specialist",
  "C-IED",
  "explosive safety",
  "demining",
  "ordnance disposal",
];

const MAX_PAGES_PER_KEYWORD = 3;
const RESULTS_PER_PAGE = 50;

const TITLE_RELEVANT_TERMS = [
  "eod",
  "explosive ordnance",
  "explosives specialist",
  "explosives handler",
  "explosive safety",
  "uxo",
  "unexploded",
  "ordnance",
  "bomb tech",
  "bomb squad",
  "demining",
  "cied",
  "c-ied",
  "disposal",
  "ammunition",
  "tss-e",
  "nuclear",
  "chemical",
  "radiological",
  "cbrn",
  "cbrne",
  "uas",
  "unmanned aerial",
  "cuas",
  "counter-uas",
  "counter uas",
];

const MILITARY_RECRUITMENT_FILTERS = [
  "recruiter",
  "rotc",
  "basic training",
  "officer candidate",
  "officer training",
  "enlistment",
  "enlisting",
  "national guard",
  "reserve",
  "mechanic",
  "medicine",
  "medical",
];

function isRelevantTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_RELEVANT_TERMS.some((kw) => lower.includes(kw));
}

function isMilitaryRecruitment(title: string): boolean {
  const lower = title.toLowerCase();
  return MILITARY_RECRUITMENT_FILTERS.some((kw) => lower.includes(kw));
}

function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("uxo") || t.includes("unexploded ordnance")) return "UXO";
  if (t.includes("bomb squad") || t.includes("bomb tech")) return "Bomb Squad";
  return "EOD";
}

/** jobs.pay_min / pay_max are integer columns; Adzuna often returns fractional USD amounts. */
function roundSalary(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  description: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  created: string;
}

type AdzunaCandidate = {
  adId: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  applyUrl: string;
  payMin: number | null;
  payMax: number | null;
};

async function fetchAdzunaPage(
  keyword: string,
  page: number
): Promise<{ jobs: AdzunaJob[]; error?: string }> {
  const params = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID ?? "",
    app_key: process.env.ADZUNA_APP_KEY ?? "",
    what: keyword,
    results_per_page: String(RESULTS_PER_PAGE),
  });

  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { jobs: [], error: `${res.status}: ${text}` };
  }

  const data = await res.json();
  return { jobs: (data?.results as AdzunaJob[]) ?? [] };
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

  for (const keyword of EOD_KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_KEYWORD; page++) {
      const { jobs: items, error } = await fetchAdzunaPage(keyword, page);
      if (error) {
        errors.push(`[${keyword} p${page}] ${error}`);
        break;
      }
      if (items.length === 0) break;

      for (const job of items) {
        const adId = parseAdzunaAdIdFromUrl(job.redirect_url) ?? String(job.id);
        if (!/^\d+$/.test(adId)) {
          skipped++;
          continue;
        }

        if (seenAdzunaIds.has(adId)) {
          skipped++;
          continue;
        }
        seenAdzunaIds.add(adId);

        if (!isRelevantTitle(job.title) || isMilitaryRecruitment(job.title)) {
          skipped++;
          continue;
        }

        candidates.push({
          adId,
          title: job.title,
          companyName: job.company.display_name,
          location: job.location.display_name,
          description: job.description,
          applyUrl: canonicalAdzunaDetailsUrl(adId),
          payMin: roundSalary(job.salary_min),
          payMax: roundSalary(job.salary_max),
        });
      }

      if (items.length < RESULTS_PER_PAGE) break;
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
      category: detectCategory(candidate.title),
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
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}
