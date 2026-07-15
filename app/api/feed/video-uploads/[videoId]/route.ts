import { NextResponse } from "next/server";
import { muxFeedVideoUrl } from "../../../../lib/feedVideoUrl";
import {
  authenticatedUser,
  feedVideoAdminClient,
  syncFeedVideoAttachmentUrl,
} from "../../../../lib/server/feedVideoServer";
import { getMuxClient } from "../../../../lib/server/muxClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ videoId: string }> };

async function ownedVideo(request: Request, videoId: string) {
  const user = await authenticatedUser(request);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = feedVideoAdminClient();
  const { data: video, error } = await admin
    .from("feed_videos")
    .select("*")
    .eq("id", videoId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (error || !video) {
    return { error: NextResponse.json({ error: "Video upload not found." }, { status: 404 }) };
  }
  return { admin, user, video };
}

export async function GET(request: Request, context: RouteContext) {
  const { videoId } = await context.params;
  const result = await ownedVideo(request, videoId);
  if ("error" in result) return result.error;
  const { video } = result;
  return NextResponse.json({
    videoId: video.id,
    status: video.status,
    playbackId: video.mux_playback_id,
    attachmentUrl: muxFeedVideoUrl(video.id, video.status, video.mux_playback_id),
    error: video.error_type,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { videoId } = await context.params;
  const result = await ownedVideo(request, videoId);
  if ("error" in result) return result.error;
  const { admin, user, video } = result;
  const body = (await request.json().catch(() => null)) as {
    parentType?: "post" | "unit_post";
    parentId?: string;
    sortOrder?: number;
  } | null;
  if (!body?.parentId || !body.parentType) {
    return NextResponse.json({ error: "A post destination is required." }, { status: 400 });
  }

  const table = body.parentType === "post" ? "posts" : "unit_posts";
  const { data: parent } = await admin
    .from(table)
    .select("id, user_id")
    .eq("id", body.parentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!parent) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const changes =
    body.parentType === "post"
      ? { post_id: parent.id, unit_post_id: null }
      : { post_id: null, unit_post_id: parent.id };
  const sortOrder = Math.max(0, Math.trunc(Number(body.sortOrder ?? 0)));
  const { data: updated, error } = await admin
    .from("feed_videos")
    .update({ ...changes, sort_order: sortOrder, updated_at: new Date().toISOString() })
    .eq("id", video.id)
    .select("*")
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Could not attach video." }, { status: 500 });
  }
  await syncFeedVideoAttachmentUrl(admin, updated);
  return NextResponse.json({
    ok: true,
    attachmentUrl: muxFeedVideoUrl(updated.id, updated.status, updated.mux_playback_id),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { videoId } = await context.params;
  const result = await ownedVideo(request, videoId);
  if ("error" in result) return result.error;
  const { admin, video } = result;

  await admin.from("feed_videos").update({
    status: "deleting",
    delete_requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", video.id);

  try {
    if (video.mux_asset_id) {
      await getMuxClient().video.assets.delete(video.mux_asset_id);
    } else if (video.mux_upload_id) {
      await getMuxClient().video.uploads.cancel(video.mux_upload_id);
    }
    await admin.from("feed_videos").update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", video.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mux deletion failed.";
    await admin.from("feed_videos").update({
      error_type: "delete_failed",
      error_messages: [message],
      updated_at: new Date().toISOString(),
    }).eq("id", video.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
