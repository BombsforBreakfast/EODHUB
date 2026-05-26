import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccessTokenForNotify } from "@/app/lib/postNotifyClient";

const SESSION_STORAGE_KEY = "eod_welcome_sidebar_ensure_attempted";

/**
 * Fire-and-forget: request the one-time founder welcome Sidebar DM once per browser profile.
 */
export function ensureWelcomeSidebarOnce(supabase: SupabaseClient): void {
  if (typeof window === "undefined") return;

  try {
    if (sessionStorage.getItem(SESSION_STORAGE_KEY) === "1") return;
  } catch {
    /* ignore */
  }

  void (async () => {
    const token = await resolveAccessTokenForNotify(supabase);
    if (!token) return;

    try {
      const res = await fetch("/api/welcome-sidebar/ensure", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn("[welcome-sidebar] ensure failed:", err);
    }
  })();
}
