import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EOD_KEYWORDS = [
  "Explosive Ordnance Disposal",
  "UXO Technician",
  "unexploded ordnance",
  "bomb technician",
  "CIED",
];

const TITLE_RELEVANT_TERMS = [
  "eod",
  "explosive ordnance",
  "explosives specialist",
  "explosives handler",
  "uxo",
  "unexploded",
  "ordnance",
  "bomb tech",
  "bomb squad",
  "demining",
  "cied",
  "disposal",
  "ammunition",
  "tss-e",
];

const MILITARY_RECRUITMENT_FILTERS = [
  "recruiter",
  "rotc",
  "basic training",
  "officer candidate",
  "officer training",
  "enlistment",
  "enlisting",
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

  // Collect all position URIs seen this run to deduplicate across keyword searches
  const seenPositionIds = new Set<string>();
  let imported = 0;
  let skipped = 0;
  const importedTitles: string[] = [];

  for (const keyword of EOD_KEYWORDS) {
    const items = await fetchUSAJobsPage(keyword, 1);

    for (const item of items) {
      const pos = item.MatchedObjectDescriptor;
      const positionId = pos.PositionID;
      const title = pos.PositionTitle;
      const applyUrl = pos.ApplyURI?.[0] ?? pos.PositionURI;
      const location = pos.PositionLocationDisplay;
      const orgName = pos.OrganizationName;
      const summary =
        pos.UserArea?.Details?.JobSummary ?? pos.QualificationSummary ?? "";

      // Skip dupes within this run
      if (seenPositionIds.has(positionId)) {
        skipped++;
        continue;
      }
      seenPositionIds.add(positionId);

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

      // Skip if already in database
      const { data: existing } = await supabase
        .from("jobs")
        .select("id")
        .eq("apply_url", applyUrl)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("jobs").insert({
        title,
        company_name: orgName,
        location,
        apply_url: applyUrl,
        description: summary,
        og_description: summary,
        og_site_name: "USAJobs.gov",
        category: detectCategory(title),
        is_approved: false,
        source_type: "usajobs",
      });

      if (!error) {
        imported++;
        importedTitles.push(title);
      }
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    sample: importedTitles.slice(0, 10),
  });
}
