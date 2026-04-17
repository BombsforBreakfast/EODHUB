/**
 * Fluid layout tokens for feed post cards — scale with the card width on every
 * viewport instead of relying on a single breakpoint or fixed px max.
 *
 * - `min(A, B)` picks the smaller computed length, so media never exceeds the
 *   card or the cap (e.g. 420px).
 * - Percent values are relative to the post card’s content box.
 */

/** Uploaded photo grid: full width of card up to ~95% (slight inset), cap 420px */
export const FEED_POST_IMAGES_MAX_WIDTH = "min(420px, 95%)" as const;

/** Embeds (YouTube, wide event images): cap 480px, never wider than card */
export const FEED_POST_EMBED_MAX_WIDTH = "min(480px, 100%)" as const;

/** Post card padding scales slightly on narrow viewports */
export const FEED_POST_CARD_PADDING = "clamp(12px, 3.2vw, 16px)" as const;
