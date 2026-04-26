import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Idempotent save: insert a saved_events row only if none exists for (userId, eventId).
 * Use from browser (anon key + user JWT) or server (service role).
 */
export async function ensureSavedEventForUser(
  db: SupabaseClient,
  userId: string,
  eventId: string
): Promise<void> {
  const { data: existing, error: existingErr } = await db
    .from("saved_events")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);
  if (existing?.id) return;
  const { error: insertErr } = await db
    .from("saved_events")
    .insert([{ event_id: eventId, user_id: userId }]);
  if (insertErr) throw new Error(insertErr.message);
}

/**
 * If legacy duplicate rows still exist, keep the first in list order
 * (e.g. created_at desc — newest first).
 */
export function dedupeSavedEventRowsByEventId<T extends { event_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.event_id)) return false;
    seen.add(r.event_id);
    return true;
  });
}
