import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccessTokenForNotify } from "@/app/lib/postNotifyClient";

const SESSION_STORAGE_KEY = "eod_country_prompt_ensure_attempted";

/**
 * Fire-and-forget: ensure a one-time in-app notification prompting the user
 * to set their country (deduped server-side).
 */
export function ensureCountryPromptOnce(supabase: SupabaseClient): void {
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
      const res = await fetch("/api/account/ensure-country-prompt", {
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
      console.warn("[country-prompt] ensure failed:", err);
    }
  })();
}
