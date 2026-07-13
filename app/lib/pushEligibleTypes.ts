/**
 * Push parity policy.
 *
 * Every in-app notification should also fire a native push so the two systems
 * stay one-for-one. Rather than maintaining an allowlist that silently drops
 * push for any newly added notification type, push is enabled by DEFAULT for
 * every notification type.
 *
 * Only add a type to the exclusion set below if it should intentionally never
 * buzz a device (e.g. purely internal bookkeeping). It is kept empty on purpose
 * so DMs, comments, likes, mentions, connections, unit activity, kangaroo court,
 * verifications, moderation notices, etc. all mirror to push.
 */
export const PUSH_EXCLUDED_NOTIFICATION_TYPES = new Set<string>([]);

export function isPushEligibleNotificationType(type: string | null | undefined): boolean {
  if (!type) return false;
  return !PUSH_EXCLUDED_NOTIFICATION_TYPES.has(type);
}
