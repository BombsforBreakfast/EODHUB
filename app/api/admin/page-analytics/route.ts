import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadAnalyticsExcludedUserIds } from "../../../lib/analyticsExclusions";
import { isExcludedFromPageTimeAnalytics } from "../../../lib/analyticsPath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Range = "24h" | "7d" | "30d" | "all";

function rangeStart(range: Range): Date | null {
  if (range === "all") return null;
  const now = Date.now();
  const hours = range === "24h" ? 24 : null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : null;
  if (hours) return new Date(now - hours * 60 * 60 * 1000);
  if (days) return new Date(now - days * 24 * 60 * 60 * 1000);
  return null;
}

type SessionRow = {
  page_path: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

function rowDurationSeconds(row: SessionRow, nowMs: number): number {
  if (typeof row.duration_seconds === "number" && row.duration_seconds >= 0) {
    return row.duration_seconds;
  }
  const startedMs = new Date(row.started_at).getTime();
  const endedMs = row.ended_at ? new Date(row.ended_at).getTime() : nowMs;
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs)) return 0;
  return Math.max(0, Math.round((endedMs - startedMs) / 1000));
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
  const range: Range =
    rangeParam === "24h" || rangeParam === "30d" || rangeParam === "all" ? rangeParam : "7d";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const excludedUserIds = await loadAnalyticsExcludedUserIds(supabase);

  const since = rangeStart(range);
  let query = supabase
    .from("page_sessions")
    .select("page_path, user_id, started_at, ended_at, duration_seconds")
    .order("started_at", { ascending: false })
    .limit(100000);

  if (since) {
    query = query.gte("started_at", since.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nowMs = Date.now();
  type Agg = {
    page_path: string;
    total_visits: number;
    unique_users: Set<string>;
    total_seconds: number;
    most_recent_visit: string;
  };
  const byPath = new Map<string, Agg>();

  for (const raw of (data ?? []) as SessionRow[]) {
    if (raw.user_id && excludedUserIds.has(raw.user_id)) continue;
    const path = raw.page_path || "/";
    if (isExcludedFromPageTimeAnalytics(path)) continue;
    const duration = rowDurationSeconds(raw, nowMs);
    const existing = byPath.get(path);
    if (existing) {
      existing.total_visits += 1;
      if (raw.user_id) existing.unique_users.add(raw.user_id);
      existing.total_seconds += duration;
      if (raw.started_at > existing.most_recent_visit) {
        existing.most_recent_visit = raw.started_at;
      }
    } else {
      const users = new Set<string>();
      if (raw.user_id) users.add(raw.user_id);
      byPath.set(path, {
        page_path: path,
        total_visits: 1,
        unique_users: users,
        total_seconds: duration,
        most_recent_visit: raw.started_at,
      });
    }
  }

  const pages = Array.from(byPath.values())
    .map((row) => ({
      page_path: row.page_path,
      total_visits: row.total_visits,
      unique_users: row.unique_users.size,
      total_seconds: row.total_seconds,
      avg_seconds:
        row.total_visits > 0 ? Math.round(row.total_seconds / row.total_visits) : 0,
      most_recent_visit: row.most_recent_visit,
    }))
    .sort((a, b) => b.total_seconds - a.total_seconds);

  return NextResponse.json({
    range,
    generated_at: new Date().toISOString(),
    pages,
  });
}
