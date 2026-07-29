import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadEventImage } from "./downloadEventImage";
import { isWeakEventCoverUrl } from "./eventImages";
import type { NormalizedEodwfEvent } from "./types";

export type UpsertPendingResult = {
  inserted: number;
  updated: number;
  skippedApproved: number;
  skippedUnchanged: number;
  imageDownloads: number;
  errors: string[];
};

async function resolveImportAuthorId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", "hello@eod-hub.com")
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

function priorRemoteImage(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const remote = (meta as Record<string, unknown>).image_remote_url;
  return typeof remote === "string" && remote.trim() ? remote.trim() : null;
}

function shouldRefreshPendingImage(args: {
  existingImageUrl: string | null;
  priorRemote: string | null;
  nextRemote: string | null;
  /** True when enricher rejected a weak/shared featured image and has no replacement. */
  clearRejectedCover: boolean;
}): boolean {
  const { existingImageUrl, priorRemote, nextRemote, clearRejectedCover } = args;
  if (!nextRemote) {
    if (clearRejectedCover && existingImageUrl) return true;
    return Boolean(existingImageUrl && priorRemote && isWeakEventCoverUrl(priorRemote));
  }
  if (!existingImageUrl) return true;
  if (priorRemote && isWeakEventCoverUrl(priorRemote)) return true;
  if (priorRemote && priorRemote !== nextRemote) return true;
  return false;
}

/**
 * Insert pending events or refresh still-pending rows. Never mutate approved rows.
 */
export async function upsertPendingEodwfEvents(
  admin: SupabaseClient,
  events: NormalizedEodwfEvent[],
): Promise<UpsertPendingResult> {
  const result: UpsertPendingResult = {
    inserted: 0,
    updated: 0,
    skippedApproved: 0,
    skippedUnchanged: 0,
    imageDownloads: 0,
    errors: [],
  };

  if (events.length === 0) return result;

  const authorId = await resolveImportAuthorId(admin);
  if (!authorId) {
    result.errors.push("No hello@eod-hub.com profile found for event author; aborting insert.");
    return result;
  }

  // Load existing by source keys
  const sourceUrls = events.map((e) => e.source_url);
  const existingByUrl = new Map<
    string,
    {
      id: string;
      is_approved: boolean;
      image_url: string | null;
      source_type: string | null;
      import_metadata: unknown;
    }
  >();

  for (let i = 0; i < sourceUrls.length; i += 100) {
    const chunk = sourceUrls.slice(i, i + 100);
    const { data, error } = await admin
      .from("events")
      .select("id, source_url, source_type, is_approved, image_url, import_metadata")
      .in("source_url", chunk);
    if (error) {
      result.errors.push(`Lookup failed: ${error.message}`);
      continue;
    }
    for (const row of data ?? []) {
      if (row.source_url) {
        existingByUrl.set(row.source_url, {
          id: row.id,
          is_approved: row.is_approved !== false,
          image_url: row.image_url ?? null,
          source_type: row.source_type ?? null,
          import_metadata: row.import_metadata ?? null,
        });
      }
    }
  }

  for (const ev of events) {
    try {
      const existing = existingByUrl.get(ev.source_url);
      if (existing?.is_approved) {
        result.skippedApproved += 1;
        continue;
      }

      const priorRemote = priorRemoteImage(existing?.import_metadata);
      const nextRemote = ev.image_remote_url?.trim() || null;
      const clearRejectedCover =
        ev.import_metadata?.image_source === "none" &&
        Boolean(ev.import_metadata?.rejected_featured_image);
      let image_url: string | null = existing?.image_url ?? null;

      if (
        shouldRefreshPendingImage({
          existingImageUrl: image_url,
          priorRemote,
          nextRemote,
          clearRejectedCover,
        })
      ) {
        if (nextRemote) {
          const downloaded = await downloadEventImage(
            admin,
            nextRemote,
            ev.source_event_id || ev.title.slice(0, 24),
          );
          if (downloaded) {
            image_url = downloaded;
            result.imageDownloads += 1;
          } else {
            // Fall back to remote URL so admin still sees a flyer preview
            image_url = nextRemote;
          }
        } else {
          image_url = null;
        }
      }

      const import_metadata = {
        ...ev.import_metadata,
        image_remote_url: nextRemote,
      };

      const row = {
        user_id: authorId,
        title: ev.title,
        description: ev.description,
        date: ev.date,
        event_time: ev.event_time,
        location: ev.location,
        organization: ev.organization,
        signup_url: ev.signup_url,
        poc_name: ev.poc_name,
        poc_phone: ev.poc_phone,
        image_url,
        visibility: "public" as const,
        unit_id: null,
        is_approved: false,
        source_type: ev.source_type,
        source_url: ev.source_url,
        source_event_id: ev.source_event_id,
        import_metadata,
      };

      if (existing) {
        const { error } = await admin.from("events").update(row).eq("id", existing.id);
        if (error) {
          result.errors.push(`Update ${ev.title}: ${error.message}`);
        } else {
          result.updated += 1;
        }
      } else {
        const { error } = await admin.from("events").insert(row);
        if (error) {
          result.errors.push(`Insert ${ev.title}: ${error.message}`);
        } else {
          result.inserted += 1;
        }
      }
    } catch (err) {
      result.errors.push(
        `${ev.title}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
