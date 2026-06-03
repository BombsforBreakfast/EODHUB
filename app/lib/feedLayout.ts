/**
 * Fluid layout tokens for feed post cards — scale with the card width on every
 * viewport instead of relying on a single breakpoint or fixed px max.
 */

/** Uploaded photo grid: full card width. */
export const FEED_POST_IMAGES_MAX_WIDTH = "100%" as const;

/** Embeds (YouTube, wide event images): full card width. */
export const FEED_POST_EMBED_MAX_WIDTH = "100%" as const;

/** Post card padding — tighter on mobile, slightly roomier on desktop. */
export const FEED_POST_CARD_PADDING = "clamp(8px, 2vw, 12px)" as const;

/** Post card corner radius — used for nested embeds, not outer post shells. */
export const FEED_POST_CARD_RADIUS = 8 as const;

/** Vertical gap between posts in the feed list (when not using divider-only layout). */
export const FEED_POST_LIST_GAP = "clamp(6px, 1.6vw, 10px)" as const;

/** Spacing between header, body, media, actions, and comments within a post. */
export const FEED_SECTION_GAP = "clamp(6px, 1.6vw, 8px)" as const;

/** Media tile corner radius. */
export const FEED_MEDIA_RADIUS = 6 as const;

/** Gap between images in a multi-image grid. */
export const FEED_MEDIA_GRID_GAP = "clamp(3px, 1vw, 5px)" as const;

/** Action row internal gap. */
export const FEED_ACTION_ROW_GAP = "clamp(6px, 1.6vw, 10px)" as const;

/** Action row vertical padding (compact tap targets without excess height). */
export const FEED_ACTION_ROW_PADDING = "clamp(4px, 1.2vw, 6px) 0" as const;

/** Author avatar in post header. */
export const FEED_POST_AVATAR_SIZE = 36 as const;

/** Single-image max height — preserves aspect ratio without dominating the viewport. */
export const FEED_SINGLE_IMAGE_MAX_HEIGHT = "min(580px, 78vh)" as const;

/** Letterbox background behind contained feed / wall post media */
export const FEED_MEDIA_FRAME_BG = "#111827" as const;

/** Stable frame for single post media — contains full image/video without hard cropping. */
export const feedSingleMediaFrameStyle = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  maxHeight: FEED_SINGLE_IMAGE_MAX_HEIGHT,
  overflow: "hidden",
  borderRadius: FEED_MEDIA_RADIUS,
  background: FEED_MEDIA_FRAME_BG,
} as const;

type FeedThemeLike = {
  borderLight: string;
};

/** Divider-based post shell — content-first, no heavy boxed card. */
export function feedPostCardStyle(t: FeedThemeLike) {
  return {
    border: "none" as const,
    borderBottom: `1px solid ${t.borderLight}`,
    borderRadius: 0,
    padding: FEED_POST_CARD_PADDING,
    background: "transparent" as const,
    minWidth: 0,
    maxWidth: "100%" as const,
    boxSizing: "border-box" as const,
  };
}

/** Image inside a fixed-ratio frame — preserves natural aspect ratio */
export const feedContainedImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center",
  display: "block",
} as const;

/** Single full-width feed image inside a reserved frame — no square crop. */
export const feedSingleImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center",
  display: "block",
} as const;
