/**
 * Central place to tune notification volume as the product matures.
 *
 * **Phase 1 — growth (default)**  
 * Smaller community, fewer organic touchpoints: slightly more nudges (hot posts,
 * thread pings) helps time-on-site and habit. Thresholds are permissive.
 *
 * **Phase 2 — balanced**  
 * As daily active users and organic engagement grow, the same volume feels
 * noisy. Raise thresholds, add per-category caps / digests / quiet hours in
 * product — or flip `NOTIFICATION_PHASE` (or `NOTIFICATION_PHASE` env on the
 * server) so hot-post fan-out and similar rules fire less often without
 * rewriting call sites.
 *
 * Env (Vercel / server): `NOTIFICATION_PHASE=balanced` → use balanced numbers.
 * Omit or `growth` → growth defaults.
 */

export type NotificationPhase = "growth" | "balanced";

function readPhase(): NotificationPhase {
  const v = process.env.NOTIFICATION_PHASE?.trim().toLowerCase();
  if (v === "balanced") return "balanced";
  return "growth";
}

/** Set via `NOTIFICATION_PHASE` on the server, or defaults to `growth`. */
export const NOTIFICATION_PHASE: NotificationPhase = readPhase();

/** Weight for each comment in unit engagement score (likes count as 1). */
export const UNIT_ENGAGEMENT_COMMENT_WEIGHT = 2;

/**
 * Unit wall: one-time "hot post" fan-out to other members when
 * `likes + commentWeight * comments` meets or exceeds this threshold.
 * Raise in balanced phase to reduce blast radius.
 */
export const UNIT_HOT_ENGAGEMENT_THRESHOLD: Record<NotificationPhase, number> = {
  growth: 12,
  balanced: 28,
};

export function getUnitHotEngagementThreshold(): number {
  return UNIT_HOT_ENGAGEMENT_THRESHOLD[NOTIFICATION_PHASE];
}

export function computeUnitEngagementScore(likeCount: number, commentCount: number): number {
  return likeCount + UNIT_ENGAGEMENT_COMMENT_WEIGHT * commentCount;
}
