import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareFeedUploadFile } from "./prepareUploadFile";
import { isImageFile, isVideoFile } from "./uploadLimits";
import type { CircuitMediaType } from "./circuit";
import { muxPosterUrl, parseMuxFeedVideoUrl } from "./feedVideoUrl";
import { uploadMuxFeedVideo } from "./muxFeedUpload";

export type CircuitUploadResult = {
  media_type: CircuitMediaType;
  public_url: string;
  storage_path: string | null;
  poster_url: string | null;
};

export async function uploadCircuitMedia(
  supabase: SupabaseClient,
  file: File,
  userId: string,
): Promise<CircuitUploadResult> {
  const prepared = await prepareFeedUploadFile(file);
  if (!prepared.ok) throw new Error(prepared.error);

  const mediaFile = prepared.file;
  const isVideo = isVideoFile(mediaFile);
  const isImage = isImageFile(mediaFile);
  if (!isVideo && !isImage) {
    throw new Error("Circuit media must be a photo or video.");
  }

  if (isVideo) {
    const mux = await uploadMuxFeedVideo(mediaFile);
    const ref = parseMuxFeedVideoUrl(mux.attachmentUrl);
    return {
      media_type: "video",
      public_url: mux.attachmentUrl,
      storage_path: mux.videoId,
      poster_url: ref?.playbackId ? muxPosterUrl(ref.playbackId) : null,
    };
  }

  const ext = mediaFile.name.includes(".")
    ? mediaFile.name.split(".").pop()?.toLowerCase()
    : "jpg";
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const storage_path = `${userId}/circuit/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from("feed-images").upload(storage_path, mediaFile, {
    upsert: false,
    contentType: mediaFile.type || "image/jpeg",
  });
  if (error) throw error;

  const public_url = supabase.storage.from("feed-images").getPublicUrl(storage_path).data.publicUrl;
  return {
    media_type: "image",
    public_url,
    storage_path,
    poster_url: null,
  };
}
