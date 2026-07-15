import { getAccessToken } from "./lib/supabaseClient";
import { parseMuxFeedVideoUrl } from "./feedVideoUrl";

export type MuxFeedUploadResult = {
  videoId: string;
  attachmentUrl: string;
};

async function authHeaders(source: string): Promise<HeadersInit> {
  const token = await getAccessToken({ force: true, source });
  if (!token) throw new Error("Your session expired. Sign in again and retry.");
  return { Authorization: `Bearer ${token}` };
}

/** Uploads video bytes directly to Mux in retryable chunks; Vercel never receives the file. */
export async function uploadMuxFeedVideo(
  file: File,
  options?: { onProgress?: (percent: number) => void; signal?: AbortSignal },
): Promise<MuxFeedUploadResult> {
  const headers = await authHeaders("uploadMuxFeedVideo");
  const createResponse = await fetch("/api/feed/video-uploads", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
    signal: options?.signal,
  });
  const created = await createResponse.json().catch(() => ({})) as {
    videoId?: string;
    uploadUrl?: string;
    attachmentUrl?: string;
    error?: string;
  };
  if (!createResponse.ok || !created.videoId || !created.uploadUrl || !created.attachmentUrl) {
    throw new Error(created.error ?? "Could not begin the Mux upload.");
  }

  const { createUpload } = await import("@mux/upchunk");
  try {
    await new Promise<void>((resolve, reject) => {
      const upload = createUpload({
        endpoint: created.uploadUrl!,
        file,
        chunkSize: 5120,
        attempts: 5,
        dynamicChunkSize: true,
      });
      const abort = () => {
        upload.abort();
        reject(new DOMException("Upload cancelled.", "AbortError"));
      };
      options?.signal?.addEventListener("abort", abort, { once: true });
      upload.on("progress", (event) => options?.onProgress?.(event.detail));
      upload.on("success", () => {
        options?.signal?.removeEventListener("abort", abort);
        options?.onProgress?.(100);
        resolve();
      });
      upload.on("error", (event) => {
        options?.signal?.removeEventListener("abort", abort);
        reject(new Error(event.detail?.message ?? "Mux upload failed."));
      });
    });
    return { videoId: created.videoId, attachmentUrl: created.attachmentUrl };
  } catch (error) {
    void cancelMuxFeedVideo(created.videoId);
    throw error;
  }
}

export async function attachMuxFeedVideo(
  videoId: string,
  parentType: "post" | "unit_post",
  parentId: string,
  sortOrder: number,
): Promise<void> {
  const headers = await authHeaders("attachMuxFeedVideo");
  const response = await fetch(`/api/feed/video-uploads/${encodeURIComponent(videoId)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ parentType, parentId, sortOrder }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Could not attach the uploaded video.");
  }
}

export async function attachMuxVideosFromUrls(
  urls: string[],
  parentType: "post" | "unit_post",
  parentId: string,
): Promise<void> {
  await Promise.all(urls.map((url, sortOrder) => {
    const reference = parseMuxFeedVideoUrl(url);
    return reference
      ? attachMuxFeedVideo(reference.id, parentType, parentId, sortOrder)
      : Promise.resolve();
  }));
}

export async function cancelMuxFeedVideo(videoId: string): Promise<void> {
  const headers = await authHeaders("cancelMuxFeedVideo");
  await fetch(`/api/feed/video-uploads/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    headers,
  });
}

export async function cancelMuxVideosFromUrls(urls: string[]): Promise<void> {
  await Promise.allSettled(urls.map((url) => {
    const reference = parseMuxFeedVideoUrl(url);
    return reference ? cancelMuxFeedVideo(reference.id) : Promise.resolve();
  }));
}
