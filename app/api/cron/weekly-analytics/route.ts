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
import { hasFullPlatformAccess } from "@/app/lib/verificationAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const WEEKLY_SEND_BATCH_SIZE = 40;

type WeeklyRecipientRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  display_name: string | null;
  email_verified: boolean | null;
  admin_verified: boolean | null;
  verification_status: string | null;
  is_pure_admin: boolean | null;
  account_type: string | null;
};

/** Sends a weekly platform rollup to all verified users. */
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

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select(
      "user_id, email, first_name, display_name, email_verified, admin_verified, verification_status, is_pure_admin, account_type",
    )
    .eq("email_verified", true)
    .eq("admin_verified", true)
    .eq("verification_status", "verified")
    .order("created_at", { ascending: true });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const uniqueRecipients = new Map<string, { email: string; firstName: string | null }>();
  for (const profile of (profileData ?? []) as WeeklyRecipientRow[]) {
    if (!hasFullPlatformAccess(profile)) continue;
    const email = profile.email?.trim().toLowerCase() ?? "";
    if (!email) continue;
    if (uniqueRecipients.has(email)) continue;
    uniqueRecipients.set(email, {
      email,
      firstName: profile.first_name?.trim() || profile.display_name?.trim() || null,
    });
  }

  const recipients = Array.from(uniqueRecipients.values());
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      recipientCount: recipients.length,
      recipientsPreview: recipients.slice(0, 25).map((recipient) => recipient.email),
      rollup,
    });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = weeklyAnalyticsSubject(rollup);
  const from = process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>";
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += WEEKLY_SEND_BATCH_SIZE) {
    const batch = recipients.slice(i, i + WEEKLY_SEND_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (recipient) => {
        const html = buildWeeklyAnalyticsEmailHtml({
          rollup,
          firstName: recipient.firstName,
        });
        const { error: sendError } = await resend.emails.send({
          from,
          to: recipient.email,
          subject,
          html,
        });
        if (sendError) {
          return { ok: false as const, message: `${recipient.email}: ${sendError.message}` };
        }
        return { ok: true as const };
      }),
    );

    for (const outcome of results) {
      if (outcome.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (errors.length < 20) errors.push(outcome.message);
      }
    }
  }

  const skipped = recipients.length - sent - failed;
  const status = failed > 0 ? 207 : 200;
  return NextResponse.json(
    {
      sent: failed === 0,
      recipients: recipients.length,
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      errors,
      rollup,
    },
    { status },
  );
}
