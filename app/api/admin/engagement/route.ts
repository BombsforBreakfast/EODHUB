import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Engagement KPIs for the admin "Engagement" tab.
//
// Returns counts + top-pages + most-engaged-users for a given range.
// Range is one of: "today" | "7d" | "30d" (default "7d"). The unique-visitor
// rollups (DAU/WAU/MAU) are computed independently and always returned.
//
// All queries run with service_role. Caller must be an admin profile.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Range = "today" | "7d" | "30d";

function rangeStart(range: Range): Date {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function previousRangeStart(range: Range): Date {
  const start = rangeStart(range);
  const span = Date.now() - start.getTime();
  return new Date(start.getTime() - span);
}

async function countDistinct(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  sinceCol: string,
  since: Date
): Promise<number> {
  // Postgres has no JS-friendly distinct-count via PostgREST; we page through
  // ids and dedupe in JS. For our scale (<1M rows) this is fine; if traffic
  // grows we'll move to a SQL view.
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .gte(sinceCol, since.toISOString())
    .not(column, "is", null)
    .limit(50000);
  if (error || !data) return 0;
  const seen = new Set<string>();
  for (const row of data as Array<Record<string, unknown>>) {
    const v = row[column];
    if (typeof v === "string") seen.add(v);
  }
  return seen.size;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const rangeParam = (url.searchParams.get("range") ?? "7d") as Range;
  const range: Range = rangeParam === "today" || rangeParam === "30d" ? rangeParam : "7d";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const since = rangeStart(range);
  const prevSince = previousRangeStart(range);
  const sinceIso = since.toISOString();
  const prevSinceIso = prevSince.toISOString();

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const [
    totalUsersRes,
    newSignupsRes,
    prevNewSignupsRes,
    sessionsCurRes,
    sessionsPrevRes,
    sessionsAggRes,
    pageViewsAggRes,
  ] = await Promise.all([
    supabase.from("profiles").select("user_id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", sinceIso),
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", prevSinceIso)
      .lt("created_at", sinceIso),
    supabase
      .from("analytics_sessions")
      .select("id", { count: "exact", head: true })
      .gte("started_at", sinceIso),
    supabase
      .from("analytics_sessions")
      .select("id", { count: "exact", head: true })
      .gte("started_at", prevSinceIso)
      .lt("started_at", sinceIso),
    // Pull active_ms for sessions in range so we can compute sum + avg in JS
    // (PostgREST doesn't give us aggregate functions directly).
    supabase
      .from("analytics_sessions")
      .select("active_ms, user_id")
      .gte("started_at", sinceIso)
      .limit(50000),
    supabase
      .from("analytics_page_views")
      .select("path, active_ms")
      .gte("started_at", sinceIso)
      .limit(100000),
  ]);

  const sessionsRows = (sessionsAggRes.data ?? []) as Array<{ active_ms: number | null; user_id: string | null }>;
  const totalActiveMs = sessionsRows.reduce((acc, r) => acc + (r.active_ms ?? 0), 0);
  const sessionsWithTime = sessionsRows.filter((r) => (r.active_ms ?? 0) > 0);
  const avgSessionMs =
    sessionsWithTime.length > 0
      ? Math.round(totalActiveMs / sessionsWithTime.length)
      : 0;

  // Unique visitors over the selected range (authenticated only — anon users
  // would need anonymous_visitor_id which we may add later).
  const uniqueVisitorsInRange = new Set<string>();
  for (const r of sessionsRows) if (r.user_id) uniqueVisitorsInRange.add(r.user_id);

  // ── Top pages ──────────────────────────────────────────────────────────────
  type PageAgg = { path: string; total_ms: number; visits: number };
  const pageMap = new Map<string, PageAgg>();
  for (const row of (pageViewsAggRes.data ?? []) as Array<{ path: string; active_ms: number | null }>) {
    const existing = pageMap.get(row.path);
    if (existing) {
      existing.total_ms += row.active_ms ?? 0;
      existing.visits += 1;
    } else {
      pageMap.set(row.path, { path: row.path, total_ms: row.active_ms ?? 0, visits: 1 });
    }
  }
  const topPagesByTime = Array.from(pageMap.values())
    .sort((a, b) => b.total_ms - a.total_ms)
    .slice(0, 10)
    .map((p) => ({
      path: p.path,
      total_ms: p.total_ms,
      visits: p.visits,
      avg_ms: p.visits > 0 ? Math.round(p.total_ms / p.visits) : 0,
    }));

  // ── Most engaged users (by total active_ms in range) ────────────────────────
  type UserAgg = { user_id: string; total_ms: number; sessions: number };
  const userMap = new Map<string, UserAgg>();
  for (const r of sessionsRows) {
    if (!r.user_id) continue;
    const existing = userMap.get(r.user_id);
    if (existing) {
      existing.total_ms += r.active_ms ?? 0;
      existing.sessions += 1;
    } else {
      userMap.set(r.user_id, { user_id: r.user_id, total_ms: r.active_ms ?? 0, sessions: 1 });
    }
  }
  const topUserAggs = Array.from(userMap.values())
    .sort((a, b) => b.total_ms - a.total_ms)
    .slice(0, 10);

  let mostEngagedUsers: Array<{
    user_id: string;
    display_name: string | null;
    total_ms: number;
    sessions: number;
  }> = topUserAggs.map((u) => ({ ...u, display_name: null }));

  if (topUserAggs.length > 0) {
    const ids = topUserAggs.map((u) => u.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name")
      .in("user_id", ids);
    const nameMap = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
    }>) {
      const name =
        p.display_name?.trim() ||
        `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
        null;
      nameMap.set(p.user_id, name ?? "");
    }
    mostEngagedUsers = topUserAggs.map((u) => ({
      ...u,
      display_name: nameMap.get(u.user_id) || null,
    }));
  }

  // ── Unique visitors DAU / WAU / MAU (independent of selected range) ─────────
  const now = Date.now();
  const dayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [dau, wau, mau] = await Promise.all([
    countDistinct(supabase, "analytics_sessions", "user_id", "started_at", dayAgo),
    countDistinct(supabase, "analytics_sessions", "user_id", "started_at", weekAgo),
    countDistinct(supabase, "analytics_sessions", "user_id", "started_at", monthAgo),
  ]);

  return NextResponse.json({
    range,
    generated_at: new Date().toISOString(),
    kpis: {
      total_users: totalUsersRes.count ?? 0,
      new_signups: newSignupsRes.count ?? 0,
      new_signups_prev: prevNewSignupsRes.count ?? 0,
      visits: sessionsCurRes.count ?? 0,
      visits_prev: sessionsPrevRes.count ?? 0,
      unique_visitors_in_range: uniqueVisitorsInRange.size,
      avg_session_ms: avgSessionMs,
      total_active_ms: totalActiveMs,
      dau,
      wau,
      mau,
    },
    top_pages: topPagesByTime,
    most_engaged_users: mostEngagedUsers,
  });
}
