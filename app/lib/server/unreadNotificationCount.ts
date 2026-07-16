import type { SupabaseClient } from "@supabase/supabase-js";

/** Returns the active in-app notification count used for launcher badges. */
export async function unreadNotificationCount(
  db: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .is("archived_at", null);

  if (!error) return Math.max(0, count ?? 0);

  // Legacy rows are removed when opened or dismissed.
  const { count: legacyCount, error: legacyError } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (legacyError) {
    console.warn("[unreadNotificationCount] Could not load badge count", {
      userId,
      error: legacyError.message,
    });
    return 0;
  }

  return Math.max(0, legacyCount ?? 0);
}
