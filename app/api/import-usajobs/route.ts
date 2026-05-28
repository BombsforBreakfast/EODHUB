import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jobListingCutoffIso } from "../../lib/jobRetention";

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
  // Allow Vercel cron (Authorization: Bearer <CRON_SECRET>) or manual ?secret= param
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

  // 1. Purge USAJobs listings older than the feed retention window (keep rejected blocklist rows).
  const cutoff = jobListingCutoffIso();
  const { count: purged } = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("source_type", "usajobs")
    .neq("is_rejected", true)
    .lt("created_at", cutoff);

  // 2. Scrape and upsert
  const seenPositionURIs = new Set<string>();
  let imported = 0;
  let refreshed = 0;
  let skipped = 0;
  const importedTitles: string[] = [];
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
      const positionURI = pos.PositionURI; // stable canonical URL — used as dedup key
      const title = pos.PositionTitle;
      const location = pos.PositionLocationDisplay;
      const orgName = pos.OrganizationName;
      const summary =
        pos.UserArea?.Details?.JobSummary ?? pos.QualificationSummary ?? "";

      // Skip dupes within this run
      if (seenPositionURIs.has(positionURI)) {
        skipped++;
        continue;
      }
      seenPositionURIs.add(positionURI);

      // Skip if title isn't EOD-relevant (avoids description-match noise)
      if (!isRelevantTitle(title)) {
        skipped++;
        continue;
      }

      // Skip military recruitment posts
      if (isMilitaryRecruitment(title)) {
        skipped++;
        continue;
      }

      // Check if already in database (by stable PositionURI)
      const { data: existing, error: selectErr } = await supabase
        .from("jobs")
        .select("id, is_rejected")
        .eq("source_type", "usajobs")
        .eq("apply_url", positionURI)
        .maybeSingle();

      if (selectErr) {
        errors.push(`[select usajobs ${positionURI}] ${selectErr.message}`);
        continue;
      }

      if (existing) {
        // Never re-import a job an admin has rejected
        if (existing.is_rejected) {
          skipped++;
          continue;
        }
        // Job still active — refresh last_seen_at for "last updated" display
        const { error: upErr } = await supabase
          .from("jobs")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (upErr) {
          errors.push(`[update usajobs ${positionURI}] ${upErr.message}`);
          continue;
        }
        refreshed++;
        continue;
      }

      // New job — insert as pending
      const { error: insErr } = await supabase.from("jobs").insert({
        title,
        company_name: orgName,
        location,
        apply_url: positionURI,
        description: summary,
        og_description: summary,
        og_site_name: "USAJobs.gov",
        category: detectCategory(title),
        is_approved: false,
        source_type: "usajobs",
        last_seen_at: new Date().toISOString(),
      });

      if (insErr) {
        errors.push(`[insert usajobs ${positionURI}] ${insErr.message}`);
        continue;
      }
      imported++;
      importedTitles.push(title);
    }
    if (items.length < 25) break; // fewer than a full page = last page
    } // end page loop
  } // end keyword loop

  return NextResponse.json({
    imported,
    refreshed,
    purged: purged ?? 0,
    skipped,
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}
