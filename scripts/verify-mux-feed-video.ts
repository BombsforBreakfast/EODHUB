import assert from "node:assert/strict";
import {
  muxFeedVideoUrl,
  muxPlaybackUrl,
  muxPosterUrl,
  parseMuxFeedVideoUrl,
} from "../app/lib/feedVideoUrl";
import { attachmentRenderKindFromUrl, isVideoUrl, UPLOAD_LIMITS } from "../app/lib/uploadLimits";
import { attachmentsFromUrls } from "../app/lib/postAttachments";
import { approvedMuxCorsOrigin } from "../app/lib/server/feedVideoServer";

const id = "6f430999-1bb8-45f1-a8cb-860f58d748bb";
const processingUrl = muxFeedVideoUrl(id, "processing");
assert.deepEqual(parseMuxFeedVideoUrl(processingUrl), {
  id,
  status: "processing",
  playbackId: null,
});
assert.equal(isVideoUrl(processingUrl), true);
assert.equal(attachmentRenderKindFromUrl(processingUrl), "video");

const readyUrl = muxFeedVideoUrl(id, "ready", "playback_123");
const attachment = attachmentsFromUrls([readyUrl])[0];
assert.equal(attachment?.kind, "video");
assert.equal(attachment?.muxPlaybackId, "playback_123");
assert.equal(attachment?.muxStatus, "ready");
assert.equal(attachment?.posterUrl, muxPosterUrl("playback_123"));
assert.equal(isVideoUrl(muxPlaybackUrl("playback_123")), true);

assert.equal(UPLOAD_LIMITS.video, 100 * 1024 * 1024);
assert.equal(UPLOAD_LIMITS.businessVideo, 200 * 1024 * 1024);
assert.equal(parseMuxFeedVideoUrl("https://example.com/video.mp4"), null);
assert.equal(
  approvedMuxCorsOrigin(new Request("https://eod-hub.com/api/feed/video-uploads", {
    headers: { Origin: "https://eod-hub.com" },
  })),
  "https://eod-hub.com",
);
assert.equal(
  approvedMuxCorsOrigin(new Request("https://eod-hub.com/api/feed/video-uploads", {
    headers: { Origin: "https://attacker.example" },
  })),
  null,
);

console.log("Mux feed video verification passed.");
