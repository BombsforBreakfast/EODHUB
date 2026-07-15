import { feedVideoAdminClient, syncFeedVideoAttachmentUrl } from "../../../lib/server/feedVideoServer";
import { getMuxClient, muxWebhookSecret } from "../../../lib/server/muxClient";
import type { FeedVideoStatus } from "../../../lib/feedVideoUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MuxEventData = {
  id?: string;
  upload_id?: string;
  asset_id?: string;
  passthrough?: string;
  status?: string;
  duration?: number;
  aspect_ratio?: string;
  max_stored_resolution?: string;
  playback_ids?: Array<{ id?: string; policy?: string }>;
  errors?: { type?: string; messages?: string[] };
};

const TERMINAL = new Set<FeedVideoStatus>(["ready", "deleted"]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: { id: string; type: string; data: MuxEventData };
  try {
    event = await getMuxClient().webhooks.unwrap(
      rawBody,
      request.headers,
      muxWebhookSecret(),
    ) as unknown as typeof event;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = feedVideoAdminClient();
  const { error: ledgerError } = await admin.from("mux_webhook_events").insert({
    mux_event_id: event.id,
    event_type: event.type,
    object_id: event.data?.id ?? null,
    payload: JSON.parse(rawBody),
  });
  if (ledgerError?.code === "23505") return new Response(null, { status: 204 });
  if (ledgerError) return new Response("Could not record event", { status: 500 });

  try {
    const data = event.data ?? {};
    let query = admin.from("feed_videos").select("*");
    if (data.passthrough) query = query.eq("id", data.passthrough);
    else if (event.type.startsWith("video.upload.") && data.id) query = query.eq("mux_upload_id", data.id);
    else if (data.upload_id) query = query.eq("mux_upload_id", data.upload_id);
    else if (data.id) query = query.eq("mux_asset_id", data.id);
    else return new Response(null, { status: 204 });

    const { data: video } = await query.maybeSingle();
    if (!video) {
      await admin.from("mux_webhook_events").update({
        processed_at: new Date().toISOString(),
        last_error: "No matching feed video yet; reconciliation required.",
        updated_at: new Date().toISOString(),
      }).eq("mux_event_id", event.id);
      return new Response(null, { status: 204 });
    }

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const currentStatus = video.status as FeedVideoStatus;
    switch (event.type) {
      case "video.upload.asset_created":
        if (!TERMINAL.has(currentStatus)) changes.status = "processing";
        changes.mux_asset_id = data.asset_id ?? video.mux_asset_id;
        break;
      case "video.upload.errored":
        if (!TERMINAL.has(currentStatus)) changes.status = "upload_failed";
        changes.error_type = data.errors?.type ?? "upload_failed";
        changes.error_messages = data.errors?.messages ?? [];
        break;
      case "video.upload.cancelled":
        if (!TERMINAL.has(currentStatus)) changes.status = "cancelled";
        break;
      case "video.asset.created":
        if (!TERMINAL.has(currentStatus)) changes.status = "processing";
        changes.mux_asset_id = data.id ?? video.mux_asset_id;
        break;
      case "video.asset.ready": {
        const playbackId = data.playback_ids?.find((item) => item.policy === "public")?.id
          ?? data.playback_ids?.[0]?.id;
        changes.status = "ready";
        changes.mux_asset_id = data.id ?? video.mux_asset_id;
        changes.mux_playback_id = playbackId ?? video.mux_playback_id;
        changes.duration_seconds = data.duration ?? null;
        changes.aspect_ratio = data.aspect_ratio ?? null;
        changes.max_stored_resolution = data.max_stored_resolution ?? null;
        changes.ready_at = new Date().toISOString();
        changes.error_type = null;
        changes.error_messages = null;
        break;
      }
      case "video.asset.errored":
        if (currentStatus !== "deleted") changes.status = "asset_error";
        changes.mux_asset_id = data.id ?? video.mux_asset_id;
        changes.error_type = data.errors?.type ?? "asset_error";
        changes.error_messages = data.errors?.messages ?? [];
        break;
      case "video.asset.deleted":
        changes.status = "deleted";
        changes.deleted_at = new Date().toISOString();
        break;
      default:
        break;
    }

    const { data: updated, error: updateError } = await admin
      .from("feed_videos")
      .update(changes)
      .eq("id", video.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    await syncFeedVideoAttachmentUrl(admin, updated);
    await admin.from("mux_webhook_events").update({
      processed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("mux_event_id", event.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await admin.from("mux_webhook_events").update({
      last_error: message,
      updated_at: new Date().toISOString(),
    }).eq("mux_event_id", event.id);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
