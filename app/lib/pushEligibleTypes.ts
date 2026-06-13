/**
 * Notification types that trigger a native push in v1.
 * High-signal only: DMs, mentions, and comment replies.
 */
export const PUSH_ELIGIBLE_NOTIFICATION_TYPES = new Set([
  "message_request",
  "message_received",
  "mention_post",
  "mention_comment",
  "feed_comment_reply",
]);

export function isPushEligibleNotificationType(type: string | null | undefined): boolean {
  if (!type) return false;
  return PUSH_ELIGIBLE_NOTIFICATION_TYPES.has(type);
}
