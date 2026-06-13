import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBlockedUserIds, filterBlockedRows } from "../userBlocks";

export const NOTIFICATIONS_STALE_MS = 20_000;

const NOTIFICATION_SELECT =
  "id, message, is_read, read_at, archived_at, created_at, actor_name, post_owner_id, link, group_key, type, actor_id, post_id, unit_id, unit_post_id, metadata";

const NOTIFICATION_FALLBACK_SELECT =
  "id, message, is_read, read_at, archived_at, created_at, actor_name, post_owner_id, link, group_key";

/**
 * Fetches the viewer's notifications. Preserves the existing v2 (recipient_user_id
 * + archived filter) vs legacy (user_id) behavior and the fallback select used
 * when the richer column set is unavailable.
 */
export async function fetchNotifications<T>(
  supabase: SupabaseClient,
  userId: string,
  v2Enabled: boolean,
): Promise<T[]> {
  const baseQuery = supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false });

  const { data, error } = v2Enabled
    ? await baseQuery.eq("recipient_user_id", userId).is("archived_at", null).limit(100)
    : await baseQuery.eq("user_id", userId).limit(50);

  if (error) {
    const { data: fallback } = await supabase
      .from("notifications")
      .select(NOTIFICATION_FALLBACK_SELECT)
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (fallback ?? []) as T[];
    const blockedUserIds = await fetchBlockedUserIds(supabase, userId);
    return filterBlockedRows(rows, blockedUserIds, (notification) =>
      (notification as { actor_id?: string | null }).actor_id,
    );
  }
  const rows = (data ?? []) as T[];
  const blockedUserIds = await fetchBlockedUserIds(supabase, userId);
  return filterBlockedRows(rows, blockedUserIds, (notification) =>
    (notification as { actor_id?: string | null }).actor_id,
  );
}
