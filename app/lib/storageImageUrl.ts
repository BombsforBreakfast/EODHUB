type ResizeMode = "cover" | "contain" | "fill";

type StorageImageOptions = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: ResizeMode;
};

export type ImageUrlUsage = "thumb" | "feed" | "display" | "original";

export type ImageUrlLike = string | {
  url?: string | null;
  original_url?: string | null;
  thumb_url?: string | null;
  feed_url?: string | null;
  display_url?: string | null;
};

const RENDER_IMAGE_PATH = "/storage/v1/render/image/";
const TRANSFORM_PARAM_KEYS = new Set(["width", "height", "quality", "resize", "format"]);
const warnedUrls = new Set<string>();

function isSupabaseTransformUrl(url: string): boolean {
  if (url.includes(RENDER_IMAGE_PATH)) return true;
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.keys()).some((key) => TRANSFORM_PARAM_KEYS.has(key));
  } catch {
    return /[?&](width|height|quality|resize|format)=/i.test(url);
  }
}

function warnIfSupabaseTransformUrl(url: string, usage: ImageUrlUsage | "legacy"): void {
  if (
    process.env.NODE_ENV !== "production"
    && typeof console !== "undefined"
    && isSupabaseTransformUrl(url)
    && !warnedUrls.has(url)
  ) {
    warnedUrls.add(url);
    console.warn(
      `Supabase image transform URL used for ${usage} image display. Prefer a stored original or generated variant URL.`,
      url,
    );
  }
}

function firstPresent(...urls: Array<string | null | undefined>): string | null {
  return urls.find((url) => !!url) ?? null;
}

/** Select a generated variant when available, otherwise fall back to the original stored URL. */
export function getBestImageUrl(image: ImageUrlLike | null | undefined, usage: ImageUrlUsage): string | null {
  if (!image) return null;

  if (typeof image === "string") {
    warnIfSupabaseTransformUrl(image, usage);
    return image;
  }

  const url =
    usage === "thumb"
      ? firstPresent(image.thumb_url, image.feed_url, image.display_url, image.original_url, image.url)
      : usage === "feed"
        ? firstPresent(image.feed_url, image.display_url, image.thumb_url, image.original_url, image.url)
        : usage === "display"
          ? firstPresent(image.display_url, image.feed_url, image.original_url, image.url, image.thumb_url)
          : firstPresent(image.original_url, image.url, image.display_url, image.feed_url, image.thumb_url);

  if (url) warnIfSupabaseTransformUrl(url, usage);
  return url;
}

/**
 * Legacy compatibility no-op.
 * Routine display paths must not generate Supabase render/image URLs; upload-time variants can be added later.
 */
export function supabaseStorageImageUrl(
  url: string | null | undefined,
  options: StorageImageOptions,
): string | null {
  if (!url) return null;
  void options;
  warnIfSupabaseTransformUrl(url, "legacy");
  return url;
}

/** Small avatars in nav, feed headers, liker stacks, etc. Use the stored public object URL. */
export function avatarImageUrl(url: string | null | undefined, displaySizePx: number): string | null {
  void displaySizePx;
  return getBestImageUrl(url, "thumb");
}

/** Feed / wall previews. Uploads are already client-resized, so avoid runtime transforms here. */
export function feedImageDisplayUrl(url: string, maxWidth = 960): string {
  void maxWidth;
  return getBestImageUrl(url, "feed") ?? url;
}

/** Profile gallery grid tiles. Use stable object URLs to avoid per-view transformations. */
export function galleryImageDisplayUrl(url: string, maxWidth = 720): string {
  void maxWidth;
  return getBestImageUrl(url, "display") ?? url;
}
