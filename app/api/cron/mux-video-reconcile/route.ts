import { NextRequest, NextResponse } from "next/server";
import { feedVideoAdminClient, syncFeedVideoAttachmentUrl } from "../../../lib/server/feedVideoServer";
import { getMuxClient } from "../../../lib/server/muxClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = feedVideoAdminClient();
  const now = new Date().toISOString();
  const staleProcessing = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: videos, error } = await admin
    .from("feed_videos")
    .select("*")
    .or(`and(status.in.(waiting_for_upload,uploading),upload_expires_at.lt.${now}),status.eq.deleting,and(status.eq.processing,updated_at.lt.${staleProcessing})`)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let reconciled = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const video of videos ?? []) {
    try {
      const changes: Record<string, unknown> = { updated_at: now };
      if (video.status === "deleting") {
        if (video.mux_asset_id) await getMuxClient().video.assets.delete(video.mux_asset_id);
        else if (video.mux_upload_id) await getMuxClient().video.uploads.cancel(video.mux_upload_id);
        Object.assign(changes, { status: "deleted", deleted_at: now });
      } else if (["waiting_for_upload", "uploading"].includes(video.status)) {
        if (video.mux_upload_id) await getMuxClient().video.uploads.cancel(video.mux_upload_id);
        Object.assign(changes, { status: "timed_out", error_type: "upload_expired" });
      } else if (video.mux_asset_id) {
        const asset = await getMuxClient().video.assets.retrieve(video.mux_asset_id);
        if (asset.status === "ready") {
          const playbackId = asset.playback_ids?.find((item) => item.policy === "public")?.id
            ?? asset.playback_ids?.[0]?.id;
          Object.assign(changes, {
            status: "ready",
            mux_playback_id: playbackId ?? video.mux_playback_id,
            duration_seconds: asset.duration ?? null,
            aspect_ratio: asset.aspect_ratio ?? null,
            max_stored_resolution: asset.max_stored_resolution ?? null,
            ready_at: video.ready_at ?? now,
            error_type: null,
            error_messages: null,
          });
        } else if (asset.status === "errored") {
          Object.assign(changes, {
            status: "asset_error",
            error_type: asset.errors?.type ?? "asset_error",
            error_messages: asset.errors?.messages ?? [],
          });
        }
      }
      const { data: updated, error: updateError } = await admin
        .from("feed_videos")
        .update(changes)
        .eq("id", video.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      await syncFeedVideoAttachmentUrl(admin, updated);
      reconciled += 1;
    } catch (cause) {
      failures.push({
        id: video.id,
        error: cause instanceof Error ? cause.message : "Reconciliation failed.",
      });
    }
  }

  return NextResponse.json({ ok: failures.length === 0, reconciled, failures }, {
    status: failures.length > 0 ? 207 : 200,
  });
}
