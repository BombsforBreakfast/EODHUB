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
const ENABLE_SUPABASE_IMAGE_TRANSFORMS =
  process.env.NEXT_PUBLIC_ENABLE_SUPABASE_IMAGE_TRANSFORMS === "true";

function isGifUrl(url: string): boolean {
  return /\.gif(\?|$)/i.test(url);
}

function isTransformableStorageImage(url: string): boolean {
  if (!url || url.startsWith("/")) return false;
  if (isVideoUrl(url) || isGifUrl(url)) return false;
  if (url.includes(RENDER_PUBLIC)) return false;
  return url.includes(OBJECT_PUBLIC);
}

function warnIfSupabaseTransformUrl(url: string): void {
  if (
    process.env.NODE_ENV !== "production"
    && typeof console !== "undefined"
    && url.includes(RENDER_PUBLIC)
  ) {
    console.warn(
      "Supabase image transform URL generated. Prefer a stored thumbnail/public object URL for frequently rendered images.",
      url,
    );
  }
}

/** Supabase Storage image transform URL. Avoid on hot page-load paths; prefer stored resized objects. */
export function supabaseStorageImageUrl(
  url: string | null | undefined,
  options: StorageImageOptions,
): string | null {
  if (!url) return null;
  if (!ENABLE_SUPABASE_IMAGE_TRANSFORMS) return url;
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
    const transformedUrl = `${parsed.origin}${RENDER_PUBLIC}${objectPath}${qs ? `?${qs}` : ""}`;
    warnIfSupabaseTransformUrl(transformedUrl);
    return transformedUrl;
  } catch {
    return url;
  }
}

/** Small avatars in nav, feed headers, liker stacks, etc. Use the stored public object URL. */
export function avatarImageUrl(url: string | null | undefined, displaySizePx: number): string | null {
  if (!url) return null;
  void displaySizePx;
  return url;
}

/** Feed / wall previews. Uploads are already client-resized, so avoid runtime transforms here. */
export function feedImageDisplayUrl(url: string, maxWidth = 960): string {
  void maxWidth;
  return url;
}

/** Profile gallery grid tiles. Use stable object URLs to avoid per-view transformations. */
export function galleryImageDisplayUrl(url: string, maxWidth = 720): string {
  void maxWidth;
  return url;
}
