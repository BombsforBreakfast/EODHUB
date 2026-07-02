import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  fetchDueCampaignBatch,
  INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY,
  markCampaignBatchResult,
  sendInactiveMemberUpdateBatch,
} from "@/app/lib/server/inactiveMemberUpdateEmailCampaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sends the next due inactive-member community update batch (200/200/97 schedule).
 * Auth: CRON_SECRET via Bearer or ?secret=.
 * Schedule: vercel.json — daily 14:00 UTC while batches remain.
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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    req.nextUrl.origin ??
    "https://eod-hub.com";
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>";

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let batch;
  try {
    batch = await fetchDueCampaignBatch(admin, INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load campaign batch";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!batch) {
    return NextResponse.json({
      ok: true,
      message: "No due campaign batch",
      campaignKey: INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      campaignKey: batch.campaign_key,
      batchNumber: batch.batch_number,
      scheduledFor: batch.scheduled_for,
      recipientCount: batch.recipients.length,
      sampleRecipients: batch.recipients.slice(0, 5),
    });
  }

  const result = await sendInactiveMemberUpdateBatch({
    recipients: batch.recipients,
    origin,
    resendApiKey: process.env.RESEND_API_KEY,
    fromEmail,
  });

  try {
    await markCampaignBatchResult(admin, batch.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark batch sent";
    return NextResponse.json(
      {
        sent: result.sent,
        failed: result.failed,
        batchNumber: batch.batch_number,
        error: message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    campaignKey: batch.campaign_key,
    batchNumber: batch.batch_number,
    scheduledFor: batch.scheduled_for,
    sent: result.sent,
    failed: result.failed,
    failedRecipients: result.failedRecipients,
  });
}
