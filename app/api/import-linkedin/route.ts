import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { detectLinkedInCategory, scoreLinkedInJob } from "../../lib/linkedin/relevance";
import {
  canonicalLinkedInJobUrl,
  parseLinkedInJobIdFromUrl,
} from "../../lib/linkedin/linkedinJob";
import { jobListingCutoffIso } from "../../lib/jobRetention";
import {
  chunkArray,
  JOB_IMPORT_LOOKUP_CHUNK,
  JOB_IMPORT_WRITE_CHUNK,
} from "../../lib/jobImportBatch";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_JOBS_PER_REQUEST = 50;

type LinkedInImportPayload = {
  linkedinJobId?: string;
  title?: string;
  companyName?: string;
  location?: string;
  description?: string;
  applyUrl?: string;
  searchQuery?: string;
  relevanceScore?: number;
};

type NormalizedCandidate = {
  linkedinJobId: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  applyUrl: string;
  searchQuery: string;
  relevanceScore: number;
  relevanceReasons: string[];
};

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  return (
    !!cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret)
  );
}

function normalizeCandidate(raw: LinkedInImportPayload): NormalizedCandidate | null {
  const linkedinJobId =
    raw.linkedinJobId?.trim() ||
    parseLinkedInJobIdFromUrl(raw.applyUrl) ||
    null;
  if (!linkedinJobId || !/^\d+$/.test(linkedinJobId)) return null;

  const title = raw.title?.trim();
  if (!title) return null;

  const companyName = raw.companyName?.trim() || "Unknown employer";
  const location = raw.location?.trim() || "";
  const description = raw.description?.trim() || "";
  const applyUrl = raw.applyUrl?.trim() || canonicalLinkedInJobUrl(linkedinJobId);
  const searchQuery = raw.searchQuery?.trim() || "unknown";

  const relevance = scoreLinkedInJob(
    { title, description, companyName },
    { searchQuery },
  );
  if (!relevance.relevant) return null;

  const relevanceScore =
    typeof raw.relevanceScore === "number" && Number.isFinite(raw.relevanceScore)
      ? Math.max(raw.relevanceScore, relevance.score)
      : relevance.score;

  return {
    linkedinJobId,
    title,
    companyName,
    location,
    description,
    applyUrl,
    searchQuery,
    relevanceScore,
    relevanceReasons: relevance.reasons,
  };
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  let body: { jobs?: LinkedInImportPayload[] };
  try {
    body = (await req.json()) as { jobs?: LinkedInImportPayload[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawJobs = Array.isArray(body.jobs) ? body.jobs : [];
  if (rawJobs.length === 0) {
    return NextResponse.json({ error: "jobs array is required" }, { status: 400 });
  }
  if (rawJobs.length > MAX_JOBS_PER_REQUEST) {
    return NextResponse.json(
      { error: `At most ${MAX_JOBS_PER_REQUEST} jobs per request` },
      { status: 400 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = jobListingCutoffIso();
  const { count: purged } = await supabase
    .from("jobs")
    .delete({ count: "exact" })
    .eq("source_type", "linkedin")
    .neq("is_rejected", true)
    .lt("created_at", cutoff);

  const seenIds = new Set<string>();
  const candidates: NormalizedCandidate[] = [];
  let skipped = 0;

  for (const raw of rawJobs) {
    const candidate = normalizeCandidate(raw);
    if (!candidate) {
      skipped += 1;
      continue;
    }
    if (seenIds.has(candidate.linkedinJobId)) {
      skipped += 1;
      continue;
    }
    seenIds.add(candidate.linkedinJobId);
    candidates.push(candidate);
  }

  const linkedinIds = candidates.map((c) => c.linkedinJobId);
  const existingByLinkedInId = new Map<
    string,
    { id: string; is_rejected: boolean }
  >();

  for (const idChunk of chunkArray(linkedinIds, JOB_IMPORT_LOOKUP_CHUNK)) {
    const { data, error: lookupErr } = await supabase
      .from("jobs")
      .select("id, linkedin_job_id, is_rejected")
      .eq("source_type", "linkedin")
      .in("linkedin_job_id", idChunk);
    if (lookupErr) {
      return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    }
    for (const row of data ?? []) {
      if (row.linkedin_job_id) {
        existingByLinkedInId.set(row.linkedin_job_id, {
          id: row.id,
          is_rejected: row.is_rejected === true,
        });
      }
    }
  }

  const errors: string[] = [];
  let imported = 0;
  let refreshed = 0;
  const importedTitles: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    const existing = existingByLinkedInId.get(candidate.linkedinJobId);
    if (existing?.is_rejected) {
      skipped += 1;
      continue;
    }

    const rowPayload = {
      title: candidate.title,
      company_name: candidate.companyName,
      location: candidate.location,
      apply_url: candidate.applyUrl,
      linkedin_job_id: candidate.linkedinJobId,
      category: detectLinkedInCategory(candidate.title),
      relevance_score: candidate.relevanceScore,
      import_metadata: {
        search_query: candidate.searchQuery,
        relevance_score: candidate.relevanceScore,
        relevance_reasons: candidate.relevanceReasons,
        intake_channel: `linkedin:${candidate.searchQuery}`,
      },
      last_seen_at: now,
    };

    if (existing) {
      const updateRow: Record<string, unknown> = { id: existing.id, ...rowPayload };
      const description = candidate.description.trim();
      if (description) {
        updateRow.description = description;
        updateRow.og_description = description;
      }
      updates.push(updateRow);
      refreshed += 1;
      continue;
    }

    const description =
      candidate.description.trim() ||
      `${candidate.title} at ${candidate.companyName}. View full details on LinkedIn.`;

    inserts.push({
      ...rowPayload,
      description,
      og_description: description,
      og_site_name: "LinkedIn",
      is_approved: false,
      source_type: "linkedin",
    });
    importedTitles.push(candidate.title);
  }

  for (const insertChunk of chunkArray(inserts, JOB_IMPORT_WRITE_CHUNK)) {
    const { error: insErr } = await supabase.from("jobs").insert(insertChunk);
    if (insErr) {
      errors.push(`[insert linkedin batch] ${insErr.message}`);
      continue;
    }
    imported += insertChunk.length;
  }

  for (const updateChunk of chunkArray(updates, JOB_IMPORT_WRITE_CHUNK)) {
    const { error: upErr } = await supabase
      .from("jobs")
      .upsert(updateChunk, { onConflict: "id" });
    if (upErr) {
      errors.push(`[update linkedin batch] ${upErr.message}`);
      refreshed -= updateChunk.length;
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
