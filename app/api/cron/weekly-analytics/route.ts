import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import {
  buildWeeklyAnalyticsEmailHtml,
  weeklyAnalyticsSubject,
} from "@/app/lib/email/weeklyAnalyticsEmail";
import {
  fetchWeeklyAnalyticsRollup,
  weeklyAnalyticsWindow,
} from "@/app/lib/server/weeklyAnalyticsRollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends a weekly platform analytics rollup to WEEKLY_ANALYTICS_EMAIL
 * (defaults to hello@eod-hub.com). Auth: CRON_SECRET via Bearer or ?secret=.
 * Schedule: vercel.json — Fridays 12:00 UTC (~8am US Eastern).
 */
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

  const to =
    process.env.WEEKLY_ANALYTICS_EMAIL?.trim() ||
    "hello@eod-hub.com";

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  const { since, until } = weeklyAnalyticsWindow();
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let rollup;
  try {
    rollup = await fetchWeeklyAnalyticsRollup(admin, since, until);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rollup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, to, rollup });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = buildWeeklyAnalyticsEmailHtml({ rollup, origin: req.nextUrl.origin });
  const subject = weeklyAnalyticsSubject(rollup);

  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to,
    subject,
    html,
  });

  if (sendError) {
    return NextResponse.json({ sent: false, error: sendError.message, rollup }, { status: 500 });
  }

  return NextResponse.json({ sent: true, to, rollup });
}
