import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  dispatchPushForPendingRow,
  type PendingNotificationRow,
} from "@/app/lib/server/pushDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Only look back a bounded window so the sweep stays cheap and never retries
// ancient rows. The min-age gate lets the immediate `after()` dispatch (for
// Node-created notifications) win first; the sweep is the backstop for
// notifications created outside the Node layer (e.g. Kangaroo Court SQL RPCs).
const WINDOW_MINUTES = 60;
const MIN_AGE_SECONDS = 90;
const BATCH_SIZE = 200;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const authorized =
    !!cronSecret && (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MINUTES * 60_000).toISOString();
  const maxCreatedAt = new Date(now - MIN_AGE_SECONDS * 1_000).toISOString();

  const { data, error } = await admin
    .from("notifications")
    .select("id, recipient_user_id, type, message, link, actor_name, pushed_at")
    .is("pushed_at", null)
    .is("archived_at", null)
    .gte("created_at", windowStart)
    .lte("created_at", maxCreatedAt)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[cron/push-pending] query failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PendingNotificationRow[];
  let pushed = 0;
  for (const row of rows) {
    try {
      const result = await dispatchPushForPendingRow(admin, row);
      if (result.pushed) pushed += 1;
    } catch (err) {
      console.error("[cron/push-pending] dispatch failed", { id: row.id, err });
    }
  }

  return NextResponse.json({ scanned: rows.length, pushed });
}
