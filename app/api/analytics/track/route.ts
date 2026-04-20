import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeAnalyticsPath, summarizeUserAgent } from "../../../lib/analyticsPath";

// Single endpoint for all client-side analytics writes. Discriminated by `action`.
//   - start:     create a session + first page_view              → returns { session_id, page_view_id }
//   - navigate:  end current page_view, open a new one           → returns { page_view_id }
//   - heartbeat: bump active_ms on session + current page_view   → returns { ok: true }
//   - end:       close session + current page_view (final flush) → returns { ok: true }
//
// Auth: optional. We accept anonymous traffic (anonymous_visitor_id from
// localStorage) so we still measure logged-out engagement. If a Bearer token
// is provided we attach the user_id; otherwise it's null.
//
// Security: all writes use service_role (RLS denies direct client access by
// design). The endpoint validates input shapes but does NOT trust the client
// for active_ms — we cap each delta at 60s to prevent inflated numbers.

export const runtime = "nodejs";

const MAX_DELTA_MS = 60_000; // sanity cap per heartbeat
const MAX_PATH_LEN = 200;

type StartBody = { action: "start"; path: string; anonymous_visitor_id?: string | null };
type NavigateBody = { action: "navigate"; session_id: string; page_view_id: string; delta_ms: number; path: string };
type HeartbeatBody = { action: "heartbeat"; session_id: string; page_view_id: string; delta_ms: number };
type EndBody = { action: "end"; session_id: string; page_view_id: string; delta_ms: number };
type Body = StartBody | NavigateBody | HeartbeatBody | EndBody;

function clampDelta(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_DELTA_MS);
}

function clampPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  return normalizeAnalyticsPath(raw).slice(0, MAX_PATH_LEN);
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token || token === "null" || token === "undefined") return null;
  try {
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data } = await userClient.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  // sendBeacon sends application/json or text/plain; handle both.
  let body: Body;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as Body) : ({} as Body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const supabase = adminClient();

  if (body.action === "start") {
    const userId = await resolveUserId(req);
    const path = clampPath(body.path);
    const ua = req.headers.get("user-agent");
    const anonId =
      typeof body.anonymous_visitor_id === "string" && body.anonymous_visitor_id.length <= 64
        ? body.anonymous_visitor_id
        : null;

    const { data: sess, error: sErr } = await supabase
      .from("analytics_sessions")
      .insert({
        user_id: userId,
        anonymous_visitor_id: anonId,
        user_agent_summary: summarizeUserAgent(ua),
      })
      .select("id")
      .single();
    if (sErr || !sess) {
      return NextResponse.json({ error: sErr?.message ?? "session insert failed" }, { status: 500 });
    }

    const { data: pv, error: pErr } = await supabase
      .from("analytics_page_views")
      .insert({ session_id: sess.id, user_id: userId, path })
      .select("id")
      .single();
    if (pErr || !pv) {
      return NextResponse.json({ error: pErr?.message ?? "page_view insert failed" }, { status: 500 });
    }

    return NextResponse.json({ session_id: sess.id, page_view_id: pv.id });
  }

  // For all other actions we need session_id + page_view_id.
  if (!("session_id" in body) || !("page_view_id" in body)) {
    return NextResponse.json({ error: "Missing session_id or page_view_id" }, { status: 400 });
  }
  const sessionId = String(body.session_id);
  const pageViewId = String(body.page_view_id);
  const delta = clampDelta((body as { delta_ms?: unknown }).delta_ms);

  // Always bump session heartbeat (even if delta is 0, refreshes last_heartbeat_at).
  // We use an RPC-free approach: read-then-update. At single-digit writes/sec per
  // user this is fine; we can move to a postgres function if write volume warrants.
  const { data: existingSess } = await supabase
    .from("analytics_sessions")
    .select("active_ms")
    .eq("id", sessionId)
    .maybeSingle();
  if (existingSess) {
    await supabase
      .from("analytics_sessions")
      .update({
        last_heartbeat_at: new Date().toISOString(),
        active_ms: (existingSess.active_ms ?? 0) + delta,
      })
      .eq("id", sessionId);
  }

  if (delta > 0) {
    const { data: existingPv } = await supabase
      .from("analytics_page_views")
      .select("active_ms")
      .eq("id", pageViewId)
      .maybeSingle();
    if (existingPv) {
      await supabase
        .from("analytics_page_views")
        .update({ active_ms: (existingPv.active_ms ?? 0) + delta })
        .eq("id", pageViewId);
    }
  }

  if (body.action === "heartbeat") {
    return NextResponse.json({ ok: true });
  }

  if (body.action === "navigate") {
    const userId = await resolveUserId(req);
    const newPath = clampPath(body.path);
    // Close the previous page_view.
    await supabase
      .from("analytics_page_views")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", pageViewId);
    // Open a new one in the same session.
    const { data: pv, error: pErr } = await supabase
      .from("analytics_page_views")
      .insert({ session_id: sessionId, user_id: userId, path: newPath })
      .select("id")
      .single();
    if (pErr || !pv) {
      return NextResponse.json({ error: pErr?.message ?? "page_view insert failed" }, { status: 500 });
    }
    return NextResponse.json({ page_view_id: pv.id });
  }

  if (body.action === "end") {
    const now = new Date().toISOString();
    await supabase
      .from("analytics_page_views")
      .update({ ended_at: now })
      .eq("id", pageViewId);
    await supabase
      .from("analytics_sessions")
      .update({ ended_at: now })
      .eq("id", sessionId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
