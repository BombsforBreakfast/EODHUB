import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runNewsIngestion } from "../../../lib/news/runner";

// Cron entry point. Called hourly by Supabase pg_cron via pg_net.http_post.
// The bearer token is set on the database via:
//   alter database postgres set app.news_cron_secret = '<NEWS_CRON_SECRET>';
// and on Vercel as the env var NEWS_CRON_SECRET.
//
// Manually triggerable via:
//   curl -X POST -H "Authorization: Bearer <secret>" https://www.eod-hub.com/api/cron/news-ingest
//
// Idempotent and self-capped (≤5 per run, ≤10 per UTC day).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function handle(req: NextRequest) {
  const secret = process.env.NEWS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NEWS_CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provided = auth.slice(7);
  if (!constantTimeEquals(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const stats = await runNewsIngestion(supabase);
  return NextResponse.json({ ok: true, stats });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// Vercel cron uses GET; supporting both keeps options open if the schedule
// migrates off Supabase later.
export async function GET(req: NextRequest) {
  return handle(req);
}
