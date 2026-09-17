/**
 * Fluid layout tokens for feed post cards — scale with the card width on every
 * viewport instead of relying on a single breakpoint or fixed px max.
 */

/** Uploaded photo grid: full card width. */
export const FEED_POST_IMAGES_MAX_WIDTH = "100%" as const;

/** Embeds (YouTube, wide event images): full card width. */
export const FEED_POST_EMBED_MAX_WIDTH = "100%" as const;

/** Post card padding — tighter on mobile, slightly roomier on desktop. */
export const FEED_POST_CARD_PADDING = "clamp(12px, 2.4vw, 16px)" as const;

/** Post card corner radius — outer shells and nested embeds. */
export const FEED_POST_CARD_RADIUS = 16 as const;

/** Vertical gap between posts in the feed list. */
export const FEED_POST_LIST_GAP = "clamp(4px, 1vw, 6px)" as const;

/** Spacing between header, body, media, actions, and comments within a post. */
export const FEED_SECTION_GAP = "clamp(8px, 1.8vw, 12px)" as const;

/** Media tile corner radius. */
export const FEED_MEDIA_RADIUS = 10 as const;

/** Gap between images in a multi-image grid. */
export const FEED_MEDIA_GRID_GAP = "clamp(4px, 1.2vw, 8px)" as const;

/** Action row internal gap. */
export const FEED_ACTION_ROW_GAP = "clamp(8px, 1.8vw, 12px)" as const;

/** Action row vertical padding (compact tap targets without excess height). */
export const FEED_ACTION_ROW_PADDING = "clamp(6px, 1.4vw, 8px) 0" as const;

/** Author avatar in post header. */
export const FEED_POST_AVATAR_SIZE = 36 as const;

/** Single-image max height — preserves aspect ratio without dominating the viewport. */
export const FEED_SINGLE_IMAGE_MAX_HEIGHT = "min(720px, 85vh)" as const;

/** Letterbox background behind contained feed / wall post media */
export const FEED_MEDIA_FRAME_BG = "#111827" as const;

/** Single post image shell — natural aspect ratio (portrait flyers fill width). */
export const feedSingleMediaFrameStyle = {
  position: "relative" as const,
  display: "block" as const,
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
  overflow: "hidden" as const,
  borderRadius: FEED_MEDIA_RADIUS,
  background: FEED_MEDIA_FRAME_BG,
  lineHeight: 0,
  boxSizing: "border-box" as const,
};

/**
 * Grid wrapper for post media — keeps Mux/video intrinsic min-width from
 * expanding past the card on iOS WebView and CSS grid.
 */
export const feedMediaGridStyle = {
  display: "grid" as const,
  width: "100%" as const,
  maxWidth: FEED_POST_IMAGES_MAX_WIDTH,
  minWidth: 0,
  boxSizing: "border-box" as const,
};

type FeedThemeLike = {
  border: string;
  surface: string;
  shadow?: string;
  radius?: number;
};

/** Hairline rounded post shell on Hub surface. */
export function feedPostCardStyle(t: FeedThemeLike) {
  return {
    border: `1px solid ${t.border}`,
    borderRadius: t.radius ?? FEED_POST_CARD_RADIUS,
    padding: FEED_POST_CARD_PADDING,
    background: t.surface,
    boxShadow: t.shadow,
    marginBottom: FEED_POST_LIST_GAP,
    minWidth: 0,
    maxWidth: "100%" as const,
    overflow: "hidden" as const,
    boxSizing: "border-box" as const,
  };
}

/** Image inside a fixed-ratio frame — preserves natural aspect ratio */
export const feedContainedImageStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: "100%",
  objectFit: "contain" as const,
  objectPosition: "center",
  display: "block" as const,
  boxSizing: "border-box" as const,
};

/** Single full-width feed image — natural height, capped for very tall assets. */
export const feedSingleImageStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  height: "auto" as const,
  maxHeight: FEED_SINGLE_IMAGE_MAX_HEIGHT,
  objectFit: "contain" as const,
  objectPosition: "center",
  display: "block" as const,
  boxSizing: "border-box" as const,
};

/** Shared containment for Mux / HTML5 video shells inside feed cards. */
export const feedVideoShellContainStyle = {
  width: "100%" as const,
  maxWidth: "100%" as const,
  minWidth: 0,
  overflow: "hidden" as const,
  boxSizing: "border-box" as const,
  display: "block" as const,
};
