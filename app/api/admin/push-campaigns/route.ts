import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isApnsConfigured } from "@/app/lib/server/apnsSend";
import { isFcmConfigured } from "@/app/lib/server/fcmSend";
import { isNativePushConfigured } from "@/app/lib/server/pushDispatch";
import {
  dispatchPushCampaign,
  type PushCampaignRow,
} from "@/app/lib/server/pushCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CampaignInput = {
  title?: unknown;
  body?: unknown;
  link?: unknown;
  scheduledFor?: unknown;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdminApiRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [{ data, error }, { count: iosTokenCount, error: tokenError }, { count: androidTokenCount, error: androidTokenError }] =
    await Promise.all([
    auth.admin
      .from("push_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    auth.admin
      .from("push_device_tokens")
      .select("id", { count: "exact", head: true })
      .eq("platform", "ios"),
    auth.admin
      .from("push_device_tokens")
      .select("id", { count: "exact", head: true })
      .eq("platform", "android"),
  ]);

  if (error || tokenError || androidTokenError) {
    console.error("[admin/push-campaigns] load failed", error ?? tokenError ?? androidTokenError);
    return NextResponse.json({ error: (error ?? tokenError ?? androidTokenError)?.message }, { status: 500 });
  }

  return NextResponse.json({
    campaigns: (data ?? []) as PushCampaignRow[],
    diagnostics: {
      apnsConfigured: isApnsConfigured(),
      fcmConfigured: isFcmConfigured(),
      nativePushConfigured: isNativePushConfigured(),
      iosTokenCount: iosTokenCount ?? 0,
      androidTokenCount: androidTokenCount ?? 0,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAdminApiRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let input: CampaignInput;
  try {
    input = (await request.json()) as CampaignInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = cleanText(input.title, 100);
  const body = cleanText(input.body, 500);
  const link = cleanText(input.link, 500) || null;
  if (!title || !body) {
    return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  }
  if (link && !link.startsWith("/")) {
    return NextResponse.json({ error: "Link must be an internal path beginning with /." }, { status: 400 });
  }

  const requestedDate =
    typeof input.scheduledFor === "string" && input.scheduledFor.trim()
      ? new Date(input.scheduledFor)
      : new Date();
  if (Number.isNaN(requestedDate.getTime())) {
    return NextResponse.json({ error: "Invalid scheduled date." }, { status: 400 });
  }
  if (requestedDate.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Scheduled date must be within one year." }, { status: 400 });
  }

  const sendImmediately = requestedDate.getTime() <= Date.now() + 30_000;
  const { data, error } = await auth.admin
    .from("push_campaigns")
    .insert({
      created_by: auth.user.id,
      title,
      body,
      link,
      scheduled_for: requestedDate.toISOString(),
      status: sendImmediately ? "processing" : "scheduled",
      started_at: sendImmediately ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[admin/push-campaigns] create failed", error);
    return NextResponse.json({ error: error?.message ?? "Campaign could not be created." }, { status: 500 });
  }

  const campaign = data as PushCampaignRow;
  if (sendImmediately) {
    await dispatchPushCampaign(auth.admin, campaign);
    const { data: completed } = await auth.admin
      .from("push_campaigns")
      .select("*")
      .eq("id", campaign.id)
      .single();
    return NextResponse.json({ campaign: (completed ?? campaign) as PushCampaignRow });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateAdminApiRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { id?: unknown; action?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; action?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.id !== "string" || body.action !== "cancel") {
    return NextResponse.json({ error: "A campaign id and cancel action are required." }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("push_campaigns")
    .update({ status: "canceled", completed_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("status", "scheduled")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[admin/push-campaigns] cancel failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Only scheduled campaigns can be canceled." }, { status: 409 });
  }

  return NextResponse.json({ campaign: data as PushCampaignRow });
}

