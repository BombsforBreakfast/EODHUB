import type { SupabaseClient } from "@supabase/supabase-js";
import { circuitExpiresAt } from "./circuit";

// Service-role client; avoid strict Database generics (tables may lag generated types).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, "public", any>;

export type CircuitEventSourceKind =
  | "event_publish"
  | "event_t30"
  | "event_t7"
  | "event_scrapbook";

export function circuitEventSourceKey(kind: CircuitEventSourceKind, eventId: string): string {
  return `${kind}:${eventId}`;
}

export function circuitEventCaption(kind: CircuitEventSourceKind, title: string | null): string {
  const name = title?.trim() || "this event";
  if (kind === "event_publish") return `New on the calendar: ${name}`;
  if (kind === "event_t30") return `Coming up in 30 days: ${name}`;
  if (kind === "event_t7") return `Coming up in 7 days: ${name}`;
  return `Share memories from ${name}`;
}

type EventRow = {
  id: string;
  title: string | null;
  visibility?: string | null;
  is_approved?: boolean | null;
  unit_id?: string | null;
};

/** Public global approved events only — never memorials / unit-scoped. */
export function isCircuitEligibleEvent(event: EventRow): boolean {
  if (event.unit_id) return false;
  if (event.visibility && event.visibility !== "public") return false;
  if (event.is_approved === false) return false;
  return true;
}

/**
 * Insert ephemeral Circuit event tiles. Deduped by source_key.
 * For event_publish, a live tile refreshes expires_at instead of no-oping.
 */
export async function insertCircuitEventTiles(
  admin: AdminClient,
  args: {
    adminUserId: string;
    kind: CircuitEventSourceKind;
    events: Array<{ id: string; title: string | null }>;
    /** When true, bump TTL on existing live tiles (used for admin re-push / publish). */
    refreshExisting?: boolean;
  },
): Promise<{ inserted: number; skipped: number; refreshed: number; error?: string }> {
  const { adminUserId, kind, events, refreshExisting = kind === "event_publish" } = args;
  if (events.length === 0) return { inserted: 0, skipped: 0, refreshed: 0 };

  const keys = events.map((e) => circuitEventSourceKey(kind, e.id));
  const { data: existing, error: existingErr } = await admin
    .from("circuit_posts")
    .select("id, source_key, expires_at")
    .in("source_key", keys);

  if (existingErr) {
    return { inserted: 0, skipped: 0, refreshed: 0, error: existingErr.message };
  }

  const existingByKey = new Map(
    ((existing ?? []) as Array<{ id: string; source_key: string | null; expires_at: string }>).map(
      (r) => [r.source_key ?? "", r],
    ),
  );

  const now = Date.now();
  const expiresAt = circuitExpiresAt().toISOString();
  let refreshed = 0;
  const toInsert: Array<{
    user_id: string;
    post_type: "event";
    event_id: string;
    source_key: string;
    title: string;
    body: string;
    expires_at: string;
  }> = [];
  let skipped = 0;

  for (const e of events) {
    const key = circuitEventSourceKey(kind, e.id);
    const live = existingByKey.get(key);
    if (live) {
      const stillLive = new Date(live.expires_at).getTime() > now;
      // Refresh when asked, or revive a unique source_key row that hasn't been purged yet.
      if (!stillLive || refreshExisting) {
        const { error: updErr } = await admin
          .from("circuit_posts")
          .update({
            expires_at: expiresAt,
            title: (e.title?.trim() || "Untitled Event").slice(0, 80),
            body: circuitEventCaption(kind, e.title),
          })
          .eq("id", live.id);
        if (updErr) {
          return { inserted: 0, skipped, refreshed, error: updErr.message };
        }
        refreshed += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    toInsert.push({
      user_id: adminUserId,
      post_type: "event",
      event_id: e.id,
      source_key: key,
      title: (e.title?.trim() || "Untitled Event").slice(0, 80),
      body: circuitEventCaption(kind, e.title),
      expires_at: expiresAt,
    });
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped, refreshed };
  }

  const { error: insertErr } = await admin.from("circuit_posts").insert(toInsert);
  if (insertErr) {
    return { inserted: 0, skipped, refreshed, error: insertErr.message };
  }

  return {
    inserted: toInsert.length,
    skipped,
    refreshed,
  };
}

/** Resolve EOD-HUB admin author id used for system Circuit tiles. */
export async function resolveCircuitAdminUserId(
  admin: AdminClient,
  adminEmail: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", adminEmail)
    .maybeSingle();
  return (data as { user_id?: string | null } | null)?.user_id ?? null;
}
