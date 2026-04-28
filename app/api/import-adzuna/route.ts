import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  canonicalAdzunaDetailsUrl,
  parseAdzunaAdIdFromUrl,
} from "../../lib/adzunaJob";

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
const STALE_DAYS = 30;

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

  // Purge stale Adzuna jobs not seen in STALE_DAYS days
  const cutoff = new Date(
    Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const { count: purged } = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("source_type", "adzuna")
    .neq("is_rejected", true)
    .lt("last_seen_at", cutoff);

  const seenAdzunaIds = new Set<string>();
  let imported = 0;
  let refreshed = 0;
  let skipped = 0;
  const importedTitles: string[] = [];
  const errors: string[] = [];

  for (const keyword of EOD_KEYWORDS) {
    for (let page = 1; page <= MAX_PAGES_PER_KEYWORD; page++) {
      const { jobs: items, error } = await fetchAdzunaPage(keyword, page);
      if (error) { errors.push(`[${keyword} p${page}] ${error}`); break; }
      if (items.length === 0) break;

      for (const job of items) {
        const adId = parseAdzunaAdIdFromUrl(job.redirect_url) ?? String(job.id);
        if (!/^\d+$/.test(adId)) {
          skipped++;
          continue;
        }

        // Same listing can appear on many keyword searches with different redirect URLs
        if (seenAdzunaIds.has(adId)) {
          skipped++;
          continue;
        }
        seenAdzunaIds.add(adId);

        if (!isRelevantTitle(job.title)) {
          skipped++;
          continue;
        }

        if (isMilitaryRecruitment(job.title)) {
          skipped++;
          continue;
        }

        const applyUrl = canonicalAdzunaDetailsUrl(adId);
        const now = new Date().toISOString();

        const { data: existing, error: selectErr } = await supabase
          .from("jobs")
          .select("id, is_rejected")
          .eq("source_type", "adzuna")
          .eq("adzuna_ad_id", adId)
          .maybeSingle();

        if (selectErr) {
          errors.push(`[select adzuna ${adId}] ${selectErr.message}`);
          continue;
        }

        if (existing) {
          if (existing.is_rejected) {
            skipped++;
            continue;
          }
          const { error: upErr } = await supabase
            .from("jobs")
            .update({
              last_seen_at: now,
              apply_url: applyUrl,
              title: job.title,
              company_name: job.company.display_name,
              location: job.location.display_name,
              description: job.description,
              og_description: job.description,
              pay_min: job.salary_min ?? null,
              pay_max: job.salary_max ?? null,
              category: detectCategory(job.title),
            })
            .eq("id", existing.id);
          if (upErr) {
            errors.push(`[update adzuna ${adId}] ${upErr.message}`);
            continue;
          }
          refreshed++;
          continue;
        }

        const { error: insErr } = await supabase.from("jobs").insert({
          title: job.title,
          company_name: job.company.display_name,
          location: job.location.display_name,
          apply_url: applyUrl,
          adzuna_ad_id: adId,
          description: job.description,
          og_description: job.description,
          og_site_name: "Adzuna",
          pay_min: job.salary_min ?? null,
          pay_max: job.salary_max ?? null,
          category: detectCategory(job.title),
          is_approved: false,
          source_type: "adzuna",
          last_seen_at: now,
        });

        if (insErr) {
          errors.push(`[insert adzuna ${adId}] ${insErr.message}`);
          continue;
        }
        imported++;
        importedTitles.push(job.title);
      }

      if (items.length < RESULTS_PER_PAGE) break;
    }
  }

  return NextResponse.json({
    imported,
    refreshed,
    purged: purged ?? 0,
    skipped,
    sample: importedTitles.slice(0, 10),
    errors: errors.length > 0 ? errors : undefined,
  });
}
