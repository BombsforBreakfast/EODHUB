import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const JOB_ADMIN_COLUMNS =
  "id, created_at, title, company_name, location, category, description, apply_url, is_approved, applications_under_review, source_type, reliefweb_job_id, relevance_score, import_metadata";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pendingOnly = req.nextUrl.searchParams.get("pendingOnly") === "true";
  const offset = parseBoundedInt(req.nextUrl.searchParams.get("offset"), 0, 0, 100_000);
  const limit = parseBoundedInt(req.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let reliefWebCountQuery = adminClient
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .neq("is_rejected", true)
    .eq("source_type", "reliefweb");
  let nonReliefCountQuery = adminClient
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .neq("is_rejected", true)
    .or("source_type.is.null,source_type.neq.reliefweb");

  if (pendingOnly) {
    reliefWebCountQuery = reliefWebCountQuery.neq("is_approved", true);
    nonReliefCountQuery = nonReliefCountQuery.neq("is_approved", true);
  }

  const [reliefWebCountRes, nonReliefCountRes] = await Promise.all([
    reliefWebCountQuery,
    nonReliefCountQuery,
  ]);

  if (reliefWebCountRes.error) {
    return NextResponse.json({ error: reliefWebCountRes.error.message }, { status: 500 });
  }
  if (nonReliefCountRes.error) {
    return NextResponse.json({ error: nonReliefCountRes.error.message }, { status: 500 });
  }

  const reliefWebCount = reliefWebCountRes.count ?? 0;
  const nonReliefCount = nonReliefCountRes.count ?? 0;
  const totalCount = reliefWebCount + nonReliefCount;

  const jobs = [];

  if (offset < reliefWebCount && jobs.length < limit) {
    const reliefFrom = offset;
    const reliefTo = Math.min(reliefWebCount - 1, offset + limit - 1);
    let reliefWebQuery = adminClient
      .from("jobs")
      .select(JOB_ADMIN_COLUMNS)
      .neq("is_rejected", true)
      .eq("source_type", "reliefweb")
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(reliefFrom, reliefTo);
    if (pendingOnly) {
      reliefWebQuery = reliefWebQuery.neq("is_approved", true);
    }
    const { data, error } = await reliefWebQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    jobs.push(...(data ?? []));
  }

  if (jobs.length < limit && offset + jobs.length < totalCount) {
    const nonReliefOffset = Math.max(0, offset - reliefWebCount);
    const nonReliefLimit = limit - jobs.length;
    let nonReliefQuery = adminClient
      .from("jobs")
      .select(JOB_ADMIN_COLUMNS)
      .neq("is_rejected", true)
      .or("source_type.is.null,source_type.neq.reliefweb")
      .order("created_at", { ascending: false })
      .range(nonReliefOffset, nonReliefOffset + nonReliefLimit - 1);
    if (pendingOnly) {
      nonReliefQuery = nonReliefQuery.neq("is_approved", true);
    }
    const { data, error } = await nonReliefQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    jobs.push(...(data ?? []));
  }

  return NextResponse.json({ jobs, totalCount });
}
