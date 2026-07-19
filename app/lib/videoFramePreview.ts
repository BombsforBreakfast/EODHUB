import { Capacitor } from "@capacitor/core";
import { nativeIosVideoPath } from "./native/pickFeedMedia";

const FRAME_CAPTURE_TIMEOUT_MS = 10_000;
const FRAME_MAX_DIMENSION = 480;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Video preview timed out.")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Local/blob URL the browser can load for a selected video (including native iOS path proxies). */
export function videoPreviewSourceUrl(file: File, existingPreviewUrl?: string): string | null {
  if (existingPreviewUrl) return existingPreviewUrl;
  const nativePath = nativeIosVideoPath(file);
  if (nativePath) {
    try {
      return Capacitor.convertFileSrc(nativePath);
    } catch {
      return null;
    }
  }
  if (file.size > 0) return URL.createObjectURL(file);
  return null;
}

/**
 * Capture a still JPEG from near the start of a video for composer thumbnails.
 * Returns an object URL the caller must revoke, or null if capture fails.
 */
export async function captureVideoFramePreviewUrl(sourceUrl: string): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.preload = "auto";
  // Avoid CORS tainting for remote URLs; local capacitor/blob URLs must not set this.
  if (/^https?:\/\//i.test(sourceUrl)) {
    video.crossOrigin = "anonymous";
  }

  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  };

  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const onReady = () => resolve();
        video.addEventListener("loadeddata", onReady, { once: true });
        video.addEventListener("error", () => reject(new Error("Could not load video for preview.")), {
          once: true,
        });
        video.src = sourceUrl;
        video.load();
      }),
      FRAME_CAPTURE_TIMEOUT_MS,
    );

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTo = duration > 0.35 ? Math.min(0.35, duration * 0.08) : 0;
    if (seekTo > 0) {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          video.addEventListener("seeked", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("Could not seek video for preview.")), {
            once: true,
          });
          try {
            video.currentTime = seekTo;
          } catch {
            resolve();
          }
        }),
        FRAME_CAPTURE_TIMEOUT_MS,
      );
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      cleanup();
      return null;
    }

    const scale = Math.min(1, FRAME_MAX_DIMENSION / Math.max(vw, vh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cleanup();
      return null;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    cleanup();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((next) => resolve(next), "image/jpeg", 0.84);
    });
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch {
    cleanup();
    return null;
  }
}
