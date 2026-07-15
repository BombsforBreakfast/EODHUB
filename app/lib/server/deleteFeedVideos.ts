import type { SupabaseClient } from "@supabase/supabase-js";
import { getMuxClient } from "./muxClient";

export async function deleteMuxVideosForParent(
  admin: SupabaseClient,
  parent: { postId?: string; unitPostId?: string },
): Promise<void> {
  let query = admin.from("feed_videos").select("*");
  if (parent.postId) query = query.eq("post_id", parent.postId);
  else if (parent.unitPostId) query = query.eq("unit_post_id", parent.unitPostId);
  else return;

  const { data: videos, error } = await query.neq("status", "deleted");
  if (error) throw error;

  for (const video of videos ?? []) {
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
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Mux deletion failed.";
      await admin.from("feed_videos").update({
        error_type: "delete_failed",
        error_messages: [message],
        updated_at: new Date().toISOString(),
      }).eq("id", video.id);
      throw new Error(message);
    }
  }
}
