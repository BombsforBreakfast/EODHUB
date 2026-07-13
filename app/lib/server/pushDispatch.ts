import type { SupabaseClient } from "@supabase/supabase-js";
import { isPushEligibleNotificationType } from "../pushEligibleTypes";
import type { CreateNotificationInput } from "../notificationsServer";
import { sendApnsPush, isApnsConfigured } from "./apnsSend";

let warnedApnsMissing = false;

function warnApnsMissingOnce(): void {
  if (!warnedApnsMissing) {
    warnedApnsMissing = true;
    console.warn("[pushDispatch] APNs environment variables are not configured");
  }
}

function pushTitle(input: CreateNotificationInput): string {
  if (input.title?.trim()) return input.title.trim();
  if (input.actorName?.trim()) return input.actorName.trim();
  return "EOD-Hub";
}

function pushBody(input: CreateNotificationInput): string {
  if (input.body?.trim()) return input.body.trim();
  if (input.message?.trim()) return input.message.trim();
  return "You have a new notification";
}

type PushContent = { title: string; body: string; link: string | null };

/**
 * Sends a native push to every eligible iOS device the user owns.
 * Respects the user's push preference and prunes stale device tokens.
 * Returns the number of devices the push was successfully delivered to.
 */
async function deliverPushToUser(
  db: SupabaseClient,
  recipientUserId: string,
  content: PushContent,
): Promise<number> {
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("push_notifications")
    .eq("user_id", recipientUserId)
    .maybeSingle();

  if (prefs && prefs.push_notifications === false) return 0;

  const { data: tokens, error: tokenErr } = await db
    .from("push_device_tokens")
    .select("id, token, platform")
    .eq("user_id", recipientUserId)
    .eq("platform", "ios");

  if (tokenErr || !tokens?.length) return 0;

  const staleTokenIds: string[] = [];
  let sentCount = 0;

  for (const row of tokens) {
    const result = await sendApnsPush(row.token, content);
    if (result.ok) {
      sentCount += 1;
      continue;
    }
    if (
      result.status === 410 ||
      /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/i.test(result.reason)
    ) {
      staleTokenIds.push(row.id);
    }
    console.warn("[pushDispatch] APNs send failed", {
      userId: recipientUserId,
      tokenId: row.id,
      reason: result.reason,
      status: result.status,
    });
  }

  if (staleTokenIds.length > 0) {
    await db.from("push_device_tokens").delete().in("id", staleTokenIds);
  }

  return sentCount;
}

export async function dispatchPushForNotification(
  db: SupabaseClient,
  input: CreateNotificationInput,
  notificationId?: string | null,
): Promise<void> {
  if (!isPushEligibleNotificationType(input.type)) return;
  if (!isApnsConfigured()) {
    warnApnsMissingOnce();
    return;
  }

  // The notification RPC can return an existing row when a dedupe key matches.
  // Do not emit the same native push again after that row was already delivered.
  if (notificationId) {
    const { data: existing } = await db
      .from("notifications")
      .select("pushed_at")
      .eq("id", notificationId)
      .maybeSingle();
    if (existing?.pushed_at) return;
  }

  const sentCount = await deliverPushToUser(db, input.recipientUserId, {
    title: pushTitle(input),
    body: pushBody(input),
    link: input.link ?? null,
  });

  if (sentCount > 0 && notificationId) {
    await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", notificationId);
  }
}

/**
 * Shape of a notification row consumed by the pending-push sweeper.
 * The `notifications` table stores the display text in `message` (there are no
 * separate title/body columns), so pushes fall back to actor + message.
 */
export type PendingNotificationRow = {
  id: string;
  recipient_user_id: string;
  type: string | null;
  message: string | null;
  link: string | null;
  actor_name: string | null;
  pushed_at: string | null;
};

/**
 * Push backstop for notifications created OUTSIDE the Node layer (e.g. SQL
 * triggers / RPCs such as Kangaroo Court) that never run through
 * `dispatchPushForNotification`. Marks the row as processed regardless of send
 * outcome so the sweeper does not retry the same row forever when a recipient
 * has push disabled or has no registered device.
 */
export async function dispatchPushForPendingRow(
  db: SupabaseClient,
  row: PendingNotificationRow,
): Promise<{ pushed: boolean }> {
  if (row.pushed_at) return { pushed: false };
  if (!isPushEligibleNotificationType(row.type)) return { pushed: false };
  if (!isApnsConfigured()) {
    warnApnsMissingOnce();
    return { pushed: false };
  }

  const title = row.actor_name?.trim() || "EOD-Hub";
  const body = row.message?.trim() || "You have a new notification";

  const sentCount = await deliverPushToUser(db, row.recipient_user_id, {
    title,
    body,
    link: row.link ?? null,
  });

  await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", row.id);

  return { pushed: sentCount > 0 };
}
