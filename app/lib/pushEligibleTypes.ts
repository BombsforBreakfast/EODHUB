/**
 * High-signal notification types that trigger native push delivery.
 * These are direct interactions with a user or content they provided.
 */
export const PUSH_ELIGIBLE_NOTIFICATION_TYPES = new Set([
  "message_request",
  "message_received",
  "connection_request",
  "connection_accepted",
  "worked_with",
  "mention_post",
  "mention_comment",
  "feed_like",
  "feed_comment",
  "feed_comment_like",
  "feed_comment_reply",
  "feed_comment_thread",
  "wall_post",
  "wall_like",
  "wall_comment",
  "wall_comment_like",
  "wall_comment_thread",
  "profile_photo_like",
  "profile_photo_comment",
  "unit_post_like",
  "unit_post_comment",
  "unit_invite",
  "unit_join_approval",
  "admin_broadcast",
]);

export function isPushEligibleNotificationType(type: string | null | undefined): boolean {
  if (!type) return false;
  return PUSH_ELIGIBLE_NOTIFICATION_TYPES.has(type);
}
