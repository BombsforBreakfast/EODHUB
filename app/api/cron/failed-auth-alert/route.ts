import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  buildFailedAuthAlertHtml,
  FAILED_AUTH_ALERT_SUBJECT_PREFIX,
  type FailedAuthAlertGroup,
} from "@/app/lib/email/failedAuthAlertEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emails ADMIN_EMAIL when there are unresolved HIGH-risk failed auth reports
 * in the last 24h. Mirrors /api/admin-pending-alert (CRON_SECRET auth,
 * service-role read, single Resend send). Wired via vercel.json cron.
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

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL env var not set" }, { status: 500 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("failed_auth_reports")
    .select(
      "id, normalized_email, email_attempted, ip_address, failure_reason, risk_level, created_at",
    )
    .is("admin_decision", null)
    .eq("risk_level", "HIGH")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Query failed", detail: error.message }, { status: 500 });
  }

  const reports = (rows ?? []) as Array<{
    id: string;
    normalized_email: string | null;
    email_attempted: string | null;
    ip_address: string | null;
    failure_reason: string;
    risk_level: string;
    created_at: string;
  }>;

  if (reports.length === 0) {
    return NextResponse.json({ sent: false, reason: "No high-risk reports" });
  }

  // Group by normalized_email (fall back to email_attempted or "unknown").
  const groups = new Map<string, FailedAuthAlertGroup>();
  for (const row of reports) {
    const key =
      row.normalized_email?.trim().toLowerCase() ||
      row.email_attempted?.trim().toLowerCase() ||
      "(no email captured)";

    const existing = groups.get(key);
    if (existing) {
      existing.attemptCount += 1;
      if (row.ip_address && !existing.ipAddresses.includes(row.ip_address)) {
        existing.ipAddresses.push(row.ip_address);
      }
      // Reports are ordered desc, so first one is latest — don't overwrite.
    } else {
      groups.set(key, {
        email: key,
        attemptCount: 1,
        latestReason: row.failure_reason,
        latestRiskLevel: row.risk_level,
        latestCreatedAt: row.created_at,
        ipAddresses: row.ip_address ? [row.ip_address] : [],
      });
    }
  }

  const groupList = [...groups.values()].sort(
    (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
  );

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = buildFailedAuthAlertHtml({
    groups: groupList,
    origin: req.nextUrl.origin,
  });

  const subject = `${FAILED_AUTH_ALERT_SUBJECT_PREFIX} — ${groupList.length} user${groupList.length === 1 ? "" : "s"} — EOD HUB`;

  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: adminEmail,
    subject,
    html,
  });

  return NextResponse.json({
    sent: !sendError,
    groupCount: groupList.length,
    reportCount: reports.length,
    error: sendError?.message,
  });
}
