import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeApp } from "./isNativeApp";

function normalizeBadgeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

/** Set the native launcher badge. Unsupported Android launchers no-op safely. */
export async function setNativeAppBadgeCount(count: number): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    const support = await Badge.isSupported();
    if (!support.isSupported) return;

    const permission = await Badge.checkPermissions();
    // PushNotifications owns the user-facing permission prompt; avoid a second prompt.
    if (permission.display !== "granted") return;

    await Badge.set({ count: normalizeBadgeCount(count) });
  } catch (error) {
    console.warn("[appIconBadge] Could not update app icon badge", error);
  }
}

/** Read the authoritative unread count and synchronize the native app icon. */
export async function syncNativeAppBadge(
  supabase: SupabaseClient,
  userId?: string | null,
): Promise<void> {
  if (!isNativeApp()) return;

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const { data } = await supabase.auth.getUser();
    resolvedUserId = data.user?.id ?? null;
  }
  if (!resolvedUserId) {
    await setNativeAppBadgeCount(0);
    return;
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", resolvedUserId)
    .is("read_at", null)
    .is("archived_at", null);

  if (!error) {
    await setNativeAppBadgeCount(count ?? 0);
    return;
  }

  // Legacy notification rows are deleted when read, so all remaining rows are active.
  const { count: legacyCount, error: legacyError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", resolvedUserId);

  if (!legacyError) await setNativeAppBadgeCount(legacyCount ?? 0);
}
