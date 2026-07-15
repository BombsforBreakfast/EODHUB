import { NextResponse } from "next/server";
import { assertMemberInteractionAllowed } from "../../../lib/memberSubscriptionServer";
import { muxFeedVideoUrl } from "../../../lib/feedVideoUrl";
import { UPLOAD_LIMITS } from "../../../lib/uploadLimits";
import {
  approvedMuxCorsOrigin,
  authenticatedUser,
  feedVideoAdminClient,
} from "../../../lib/server/feedVideoServer";
import { getMuxClient } from "../../../lib/server/muxClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_NAME = /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i;

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const corsOrigin = approvedMuxCorsOrigin(request);
  if (!corsOrigin) {
    return NextResponse.json({ error: "Upload origin is not allowed." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  const fileName = body?.fileName?.trim() ?? "";
  const mimeType = body?.mimeType?.trim().toLowerCase() || "application/octet-stream";
  const sizeBytes = Number(body?.sizeBytes ?? 0);
  if (!fileName || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "Valid video metadata is required." }, { status: 400 });
  }
  if (!mimeType.startsWith("video/") && !VIDEO_NAME.test(fileName)) {
    return NextResponse.json({ error: "Unsupported video file type." }, { status: 415 });
  }

  const admin = feedVideoAdminClient();
  const gate = await assertMemberInteractionAllowed(admin, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 403 });

  const { data: profile } = await admin
    .from("profiles")
    .select("account_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const limit =
    profile?.account_type === "business_org"
      ? UPLOAD_LIMITS.businessVideo
      : UPLOAD_LIMITS.video;
  if (sizeBytes > limit) {
    return NextResponse.json({ error: `Video exceeds the ${limit / 1024 / 1024} MB limit.` }, { status: 413 });
  }

  const { count } = await admin
    .from("feed_videos")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .in("status", ["waiting_for_upload", "uploading", "processing"]);
  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: "Finish or cancel an existing video upload first." }, { status: 429 });
  }

  const { data: video, error: insertError } = await admin
    .from("feed_videos")
    .insert({
      owner_user_id: user.id,
      source_filename: fileName.slice(0, 255),
      source_mime_type: mimeType.slice(0, 100),
      source_size_bytes: sizeBytes,
    })
    .select("id")
    .single();
  if (insertError || !video) {
    return NextResponse.json({ error: insertError?.message ?? "Could not begin upload." }, { status: 500 });
  }

  try {
    const upload = await getMuxClient().video.uploads.create({
      cors_origin: corsOrigin,
      timeout: 86_400,
      new_asset_settings: {
        playback_policies: ["public"],
        video_quality: "basic",
        max_resolution_tier: "1080p",
        passthrough: video.id,
      },
    });
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const { error: updateError } = await admin
      .from("feed_videos")
      .update({
        mux_upload_id: upload.id,
        upload_expires_at: expiresAt,
        status: "uploading",
        updated_at: new Date().toISOString(),
      })
      .eq("id", video.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      videoId: video.id,
      uploadUrl: upload.url,
      expiresAt,
      attachmentUrl: muxFeedVideoUrl(video.id, "uploading"),
    }, { status: 201 });
  } catch (error) {
    await admin.from("feed_videos").delete().eq("id", video.id);
    const message = error instanceof Error ? error.message : "Mux upload creation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
