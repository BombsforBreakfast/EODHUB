import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jobListingCutoffIso } from "../../lib/jobRetention";
import {
  chunkArray,
  JOB_IMPORT_LOOKUP_CHUNK,
  JOB_IMPORT_WRITE_CHUNK,
} from "../../lib/jobImportBatch";

const EOD_KEYWORDS = [
  "Explosive Ordnance Disposal",
  "UXO Technician",
  "unexploded ordnance",
  "bomb technician",
  "CIED",
  "C-IED",
  "explosive safety",
  "TSS-E",
  "Transportation Security Specialist Explosives",
  "explosives specialist",
  "UAS",
  "unmanned aerial systems",
  "CUAS",
  "C-UAS",
  "nuclear",
  "chemical",
  "radiological",
  "Emergency Management Specialist",
  "Nuclear Materials Courier",
];

const MAX_PAGES_PER_KEYWORD = 5;

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
  "transportation security specialist",
  "nuclear",
  "chemical",
  "radiological",
  "cbrn",
  "cbrne",
  "emergency management specialist",
  "nuclear materials courier",
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
  "inspector",
  "title 32",
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

interface USAJobsItem {
  MatchedObjectDescriptor: {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay: string;
    OrganizationName: string;
    DepartmentName?: string;
    QualificationSummary?: string;
    UserArea?: {
      Details?: {
        JobSummary?: string;
      };
    };
  };
}

type USAJobCandidate = {
  positionURI: string;
  title: string;
  location: string;
  orgName: string;
  summary: string;
};

async function fetchUSAJobsPage(
  keyword: string,
  page: number
): Promise<{ items: USAJobsItem[]; error?: string }> {
  const params = new URLSearchParams({
    Keyword: keyword,
    ResultsPerPage: "25",
    Page: String(page),
  });

  const res = await fetch(
    `https://data.usajobs.gov/api/Search?${params.toString()}`,
    {
      headers: {
        "Authorization-Key": process.env.USAJOBS_API_KEY ?? "",
        "User-Agent": process.env.USAJOBS_EMAIL ?? "",
        Host: "data.usajobs.gov",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { items: [], error: `${res.status}: ${text}` };
  }

  const data = await res.json();
  return {
    items: (data?.SearchResult?.SearchResultItems as USAJobsItem[]) ?? [],
  };
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

  const seenPositionURIs = new Set<string>();
  const candidates: USAJobCandidate[] = [];
  const errors: string[] = [];

  for (const keyword of EOD_KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_KEYWORD; page++) {
      const { items, error: fetchErr } = await fetchUSAJobsPage(keyword, page);
      if (fetchErr) {
        errors.push(`[${keyword} p${page}] ${fetchErr}`);
        break;
      }
      if (items.length === 0) break;

      for (const item of items) {
        const pos = item.MatchedObjectDescriptor;
        const positionURI = pos.PositionURI;
        const title = pos.PositionTitle;

        if (seenPositionURIs.has(positionURI)) continue;
        seenPositionURIs.add(positionURI);

        if (!isRelevantTitle(title) || isMilitaryRecruitment(title)) continue;

        candidates.push({
          positionURI,
          title,
          location: pos.PositionLocationDisplay,
          orgName: pos.OrganizationName,
          summary: pos.UserArea?.Details?.JobSummary ?? pos.QualificationSummary ?? "",
        });
      }

      if (items.length < 25) break;
    }
  }

  const applyUrls = candidates.map((c) => c.positionURI);
  const existingByUrl = new Map<string, { id: string; is_rejected: boolean }>();

  for (const urlChunk of chunkArray(applyUrls, JOB_IMPORT_LOOKUP_CHUNK)) {
    const { data, error: lookupErr } = await supabase
      .from("jobs")
      .select("id, apply_url, is_rejected")
      .eq("source_type", "usajobs")
      .in("apply_url", urlChunk);
    if (lookupErr) {
      errors.push(`[lookup usajobs batch] ${lookupErr.message}`);
      continue;
    }
    for (const row of data ?? []) {
      if (row.apply_url) {
        existingByUrl.set(row.apply_url, { id: row.id, is_rejected: row.is_rejected === true });
      }
    }
  }

  let imported = 0;
  let refreshed = 0;
  let skipped = 0;
  const importedTitles: string[] = [];
  const refreshIds: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    const existing = existingByUrl.get(candidate.positionURI);
    if (existing) {
      if (existing.is_rejected) {
        skipped++;
        continue;
      }
      refreshIds.push(existing.id);
      refreshed++;
      continue;
    }

    inserts.push({
      title: candidate.title,
      company_name: candidate.orgName,
      location: candidate.location,
      apply_url: candidate.positionURI,
      description: candidate.summary,
      og_description: candidate.summary,
      og_site_name: "USAJobs.gov",
      category: detectCategory(candidate.title),
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
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}
