import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchPushForNotification } from "./server/pushDispatch";

export type CreateNotificationInput = {
  recipientUserId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  postOwnerId?: string | null;
  type: string;
  category?: string;
  entityType?: string | null;
  entityId?: string | null;
  parentEntityType?: string | null;
  parentEntityId?: string | null;
  message?: string | null;
  title?: string | null;
  body?: string | null;
  link?: string | null;
  groupKey?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  /** When set, stored on `notifications.post_id` for feed deep links and grouping. */
  postId?: string | null;
};

export async function createNotification(
  db: SupabaseClient,
  input: CreateNotificationInput,
): Promise<void> {
  if (input.actorUserId && input.actorUserId !== input.recipientUserId) {
    const { data: blockRows, error: blockError } = await db
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", input.recipientUserId)
      .eq("blocked_id", input.actorUserId)
      .limit(1);
    if (!blockError && (blockRows?.length ?? 0) > 0) {
      return;
    }
  }

  const { data, error } = await db.rpc("create_notification", {
    p_recipient_user_id: input.recipientUserId,
    p_actor_user_id: input.actorUserId ?? null,
    p_actor_name: input.actorName ?? null,
    p_post_owner_id: input.postOwnerId ?? null,
    p_type: input.type,
    p_category: input.category ?? "system",
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_parent_entity_type: input.parentEntityType ?? null,
    p_parent_entity_id: input.parentEntityId ?? null,
    p_title: input.title ?? null,
    p_body: input.body ?? null,
    p_message: input.message ?? null,
    p_link: input.link ?? null,
    p_group_key: input.groupKey ?? null,
    p_dedupe_key: input.dedupeKey ?? null,
    p_metadata: input.metadata ?? {},
    p_post_id: input.postId ?? null,
  });

  if (error) throw error;

  const notificationId =
    data && typeof data === "object" && "id" in data && typeof data.id === "string"
      ? data.id
      : null;

  after(async () => {
    try {
      await dispatchPushForNotification(db, input, notificationId);
    } catch (pushErr) {
      console.error("[createNotification] push dispatch failed", pushErr);
    }
  });
}
