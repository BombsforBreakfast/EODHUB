import { isVideoUrl } from "./uploadLimits";

type ResizeMode = "cover" | "contain" | "fill";

type StorageImageOptions = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: ResizeMode;
};

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

function isGifUrl(url: string): boolean {
  return /\.gif(\?|$)/i.test(url);
}

function isTransformableStorageImage(url: string): boolean {
  if (!url || url.startsWith("/")) return false;
  if (isVideoUrl(url) || isGifUrl(url)) return false;
  if (url.includes(RENDER_PUBLIC)) return false;
  return url.includes(OBJECT_PUBLIC);
}

/** Supabase Storage image transform URL (reduces cached egress for public buckets). */
export function supabaseStorageImageUrl(
  url: string | null | undefined,
  options: StorageImageOptions,
): string | null {
  if (!url) return null;
  if (!isTransformableStorageImage(url)) return url;

  try {
    const parsed = new URL(url);
    const markerIndex = parsed.pathname.indexOf(OBJECT_PUBLIC);
    if (markerIndex === -1) return url;

    const objectPath = parsed.pathname.slice(markerIndex + OBJECT_PUBLIC.length);
    const params = new URLSearchParams();
    if (options.width != null) params.set("width", String(Math.round(options.width)));
    if (options.height != null) params.set("height", String(Math.round(options.height)));
    if (options.quality != null) params.set("quality", String(Math.round(options.quality)));
    if (options.resize) params.set("resize", options.resize);

    const qs = params.toString();
    return `${parsed.origin}${RENDER_PUBLIC}${objectPath}${qs ? `?${qs}` : ""}`;
  } catch {
    return url;
  }
}

/** Small avatars in nav, feed headers, liker stacks, etc. */
export function avatarImageUrl(url: string | null | undefined, displaySizePx: number): string | null {
  if (!url) return null;
  const px = Math.max(64, Math.min(512, Math.round(displaySizePx * 2)));
  return supabaseStorageImageUrl(url, {
    width: px,
    height: px,
    resize: "cover",
    quality: 75,
  });
}

/** Feed / wall thumbnails (full image opens in gallery at original URL). */
export function feedImageDisplayUrl(url: string, maxWidth = 960): string {
  return (
    supabaseStorageImageUrl(url, {
      width: maxWidth,
      resize: "contain",
      quality: 80,
    }) ?? url
  );
}

/** Profile gallery grid tiles. */
export function galleryImageDisplayUrl(url: string, maxWidth = 720): string {
  return (
    supabaseStorageImageUrl(url, {
      width: maxWidth,
      resize: "contain",
      quality: 80,
    }) ?? url
  );
}
