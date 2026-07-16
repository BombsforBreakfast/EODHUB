import type { SupabaseClient } from "@supabase/supabase-js";
import { isPushEligibleNotificationType } from "../pushEligibleTypes";
import type { CreateNotificationInput } from "../notificationsServer";
import { sendApnsPush, isApnsConfigured } from "./apnsSend";
import { sendFcmPush, isFcmConfigured, isInvalidFcmToken } from "./fcmSend";
import { unreadNotificationCount } from "./unreadNotificationCount";

let warnedPushMissing = false;

function warnPushMissingOnce(): void {
  if (!warnedPushMissing) {
    warnedPushMissing = true;
    console.warn(
      "[pushDispatch] No push providers configured (APNs and/or FIREBASE_SERVICE_ACCOUNT_JSON)",
    );
  }
}

export function isNativePushConfigured(): boolean {
  return isApnsConfigured() || isFcmConfigured();
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

type PushContent = {
  title: string;
  body: string;
  link: string | null;
  badgeCount?: number;
};

type DeviceTokenRow = {
  id: string;
  token: string;
  platform: string;
};

/**
 * Sends a native push to every eligible iOS/Android device the user owns.
 * Respects the user's push preference and prunes stale device tokens.
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
    .eq("user_id", recipientUserId);

  if (tokenErr || !tokens?.length) return 0;

  const payload = {
    ...content,
    badgeCount: await unreadNotificationCount(db, recipientUserId),
  };
  const staleTokenIds: string[] = [];
  let sentCount = 0;

  for (const row of tokens as DeviceTokenRow[]) {
    if (row.platform === "ios") {
      if (!isApnsConfigured()) continue;
      const result = await sendApnsPush(row.token, payload);
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
      continue;
    }

    if (row.platform === "android") {
      if (!isFcmConfigured()) continue;
      const result = await sendFcmPush(row.token, payload);
      if (result.ok) {
        sentCount += 1;
        continue;
      }
      if (isInvalidFcmToken(result)) {
        staleTokenIds.push(row.id);
      }
      console.warn("[pushDispatch] FCM send failed", {
        userId: recipientUserId,
        tokenId: row.id,
        reason: result.reason,
        status: result.status,
      });
    }
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
  if (!isNativePushConfigured()) {
    warnPushMissingOnce();
    return;
  }

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

export type PendingNotificationRow = {
  id: string;
  recipient_user_id: string;
  type: string | null;
  message: string | null;
  link: string | null;
  actor_name: string | null;
  pushed_at: string | null;
};

export async function dispatchPushForPendingRow(
  db: SupabaseClient,
  row: PendingNotificationRow,
): Promise<{ pushed: boolean }> {
  if (row.pushed_at) return { pushed: false };
  if (!isPushEligibleNotificationType(row.type)) return { pushed: false };
  if (!isNativePushConfigured()) {
    warnPushMissingOnce();
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
