export type FeedVideoStatus =
  | "waiting_for_upload"
  | "uploading"
  | "processing"
  | "ready"
  | "upload_failed"
  | "asset_error"
  | "cancelled"
  | "timed_out"
  | "deleting"
  | "deleted";

export type MuxFeedVideoReference = {
  id: string;
  status: FeedVideoStatus;
  playbackId: string | null;
};

const PREFIX = "mux://feed-video/";

export function muxFeedVideoUrl(
  id: string,
  status: FeedVideoStatus,
  playbackId?: string | null,
): string {
  return `${PREFIX}${encodeURIComponent(id)}/${status}/${encodeURIComponent(playbackId ?? "")}`;
}

export function parseMuxFeedVideoUrl(url: string): MuxFeedVideoReference | null {
  if (!url.startsWith(PREFIX)) return null;
  const [rawId, rawStatus, rawPlaybackId = ""] = url.slice(PREFIX.length).split("/");
  if (!rawId || !rawStatus) return null;
  return {
    id: decodeURIComponent(rawId),
    status: rawStatus as FeedVideoStatus,
    playbackId: rawPlaybackId ? decodeURIComponent(rawPlaybackId) : null,
  };
}

export function muxPlaybackUrl(playbackId: string): string {
  return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
}

export function muxPosterUrl(playbackId: string): string {
  // fit_mode=preserve keeps portrait/landscape video aspect instead of smart-cropping.
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.webp?time=0&fit_mode=preserve`;
}
