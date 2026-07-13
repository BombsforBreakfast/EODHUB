import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  dispatchPushCampaign,
  type PushCampaignRow,
} from "@/app/lib/server/pushCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
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

  // Recover work abandoned by a terminated invocation.
  await admin
    .from("push_campaigns")
    .update({ status: "scheduled", started_at: null, last_error: "Recovered after interrupted send." })
    .eq("status", "processing")
    .lt("started_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

  const { data, error } = await admin.rpc("claim_due_push_campaigns", { p_limit: 5 });
  if (error) {
    console.error("[cron/push-campaigns] claim failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const campaigns = (data ?? []) as PushCampaignRow[];
  for (const campaign of campaigns) {
    await dispatchPushCampaign(admin, campaign);
  }

  return NextResponse.json({ processed: campaigns.length });
}

