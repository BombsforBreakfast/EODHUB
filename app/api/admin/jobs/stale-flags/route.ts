import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type StaleFlagReporter = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  service: string | null;
};

export type StaleFlagRow = {
  id: string;
  job_id: string;
  reporter_id: string;
  reason: string;
  notes: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  reporter: StaleFlagReporter | null;
};

export type StaleFlagJobGroup = {
  job: {
    id: string;
    title: string | null;
    company_name: string | null;
    location: string | null;
    category: string | null;
    apply_url: string | null;
    source_type: string | null;
    created_at: string | null;
    community_stale_count: number;
    applications_under_review: boolean;
  };
  openCount: number;
  latestCreatedAt: string;
  reasons: string[];
  flags: StaleFlagRow[];
};

export type StaleFlagApiResponse = {
  groups: StaleFlagJobGroup[];
  totalOpenFlags: number;
  totalOpenJobs: number;
};

/**
 * GET /api/admin/jobs/stale-flags
 *
 * Returns user-submitted stale-job reports, grouped per job. Default view
 * shows only open flags (admin triage queue); pass ?includeResolved=true to
 * also surface dismissed / job_deleted history.
 */
export async function GET(req: NextRequest) {
  const authHeader =
    req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 503 },
    );
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const includeResolved =
    req.nextUrl.searchParams.get("includeResolved") === "true";

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let flagsQuery = adminClient
    .from("job_stale_flags")
    .select(
      "id, job_id, reporter_id, reason, notes, status, created_at, resolved_at, resolved_by, resolution_notes",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (!includeResolved) {
    flagsQuery = flagsQuery.eq("status", "open");
  }

  const { data: flagRows, error: flagErr } = await flagsQuery;
  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }

  const flags = flagRows ?? [];
  if (flags.length === 0) {
    return NextResponse.json<StaleFlagApiResponse>({
      groups: [],
      totalOpenFlags: 0,
      totalOpenJobs: 0,
    });
  }

  const jobIds = Array.from(new Set(flags.map((f) => f.job_id)));
  const reporterIds = Array.from(new Set(flags.map((f) => f.reporter_id)));

  const [jobsRes, reportersRes] = await Promise.all([
    adminClient
      .from("jobs")
      .select(
        "id, title, company_name, location, category, apply_url, source_type, created_at, community_stale_count, applications_under_review",
      )
      .in("id", jobIds),
    adminClient
      .from("profiles")
      .select("user_id, email, first_name, last_name, display_name, service")
      .in("user_id", reporterIds),
  ]);

  const jobsById = new Map(
    (jobsRes.data ?? []).map((j) => [j.id as string, j]),
  );
  const reportersById = new Map(
    (reportersRes.data ?? []).map((r) => [r.user_id as string, r]),
  );

  // Group per job
  const groupMap = new Map<string, StaleFlagJobGroup>();
  for (const flag of flags) {
    const job = jobsById.get(flag.job_id);
    if (!job) continue; // job was hard-deleted; skip orphan flag row
    const reporter = reportersById.get(flag.reporter_id) ?? null;
    const flagRow: StaleFlagRow = {
      ...flag,
      reporter: reporter
        ? {
            id: reporter.user_id,
            email: reporter.email ?? null,
            first_name: reporter.first_name ?? null,
            last_name: reporter.last_name ?? null,
            display_name: reporter.display_name ?? null,
            service: reporter.service ?? null,
          }
        : null,
    };

    let group = groupMap.get(flag.job_id);
    if (!group) {
      group = {
        job: {
          id: job.id,
          title: job.title ?? null,
          company_name: job.company_name ?? null,
          location: job.location ?? null,
          category: job.category ?? null,
          apply_url: job.apply_url ?? null,
          source_type: job.source_type ?? null,
          created_at: job.created_at ?? null,
          community_stale_count: job.community_stale_count ?? 0,
          applications_under_review: job.applications_under_review === true,
        },
        openCount: 0,
        latestCreatedAt: flag.created_at,
        reasons: [],
        flags: [],
      };
      groupMap.set(flag.job_id, group);
    }

    group.flags.push(flagRow);
    if (flag.status === "open") {
      group.openCount += 1;
    }
    if (!group.reasons.includes(flag.reason)) {
      group.reasons.push(flag.reason);
    }
    if (flag.created_at > group.latestCreatedAt) {
      group.latestCreatedAt = flag.created_at;
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    b.latestCreatedAt.localeCompare(a.latestCreatedAt),
  );

  const totalOpenFlags = flags.filter((f) => f.status === "open").length;
  const totalOpenJobs = groups.filter((g) => g.openCount > 0).length;

  return NextResponse.json<StaleFlagApiResponse>({
    groups,
    totalOpenFlags,
    totalOpenJobs,
  });
}
