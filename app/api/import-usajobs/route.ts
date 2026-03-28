import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  "biological",
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
  "biological",
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
];

const STALE_DAYS = 30;

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
): Promise<USAJobsItem[]> {
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

  if (!res.ok) return [];

  const data = await res.json();
  return (data?.SearchResult?.SearchResultItems as USAJobsItem[]) ?? [];
}

export async function GET(req: NextRequest) {
  // Allow Vercel cron (Authorization: Bearer <CRON_SECRET>) or manual ?secret= param
  const authHeader = req.headers.get("authorization");
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

  // 1. Purge stale USAJobs entries not seen in the last STALE_DAYS days
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count: purged } = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("source_type", "usajobs")
    .lt("last_seen_at", cutoff);

  // 2. Scrape and upsert
  const seenPositionURIs = new Set<string>();
  let imported = 0;
  let refreshed = 0;
  let skipped = 0;
  const importedTitles: string[] = [];

  for (const keyword of EOD_KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_KEYWORD; page++) {
    const items = await fetchUSAJobsPage(keyword, page);
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
      const { data: existing } = await supabase
        .from("jobs")
        .select("id")
        .eq("apply_url", positionURI)
        .maybeSingle();

      if (existing) {
        // Job still active — refresh last_seen_at to reset the 30-day clock
        await supabase
          .from("jobs")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);
        refreshed++;
        continue;
      }

      // New job — insert as pending
      const { error } = await supabase.from("jobs").insert({
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

      if (!error) {
        imported++;
        importedTitles.push(title);
      }
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
  });
}
