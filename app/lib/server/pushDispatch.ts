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

type PlatformDelivery = { configured: boolean; registered: number; attempted: number; accepted: number; failures: string[] };
export type PushDeliveryReport = {
  ios: PlatformDelivery;
  android: PlatformDelivery;
  skipped?: "excluded" | "not_configured" | "already_sent" | "disabled" | "no_devices" | "device_lookup_failed";
};
function deliveryReport(): PushDeliveryReport {
  const platform = (configured: boolean): PlatformDelivery => ({ configured, registered: 0, attempted: 0, accepted: 0, failures: [] });
  return { ios: platform(isApnsConfigured()), android: platform(isFcmConfigured()) };
}
function acceptedCount(report: PushDeliveryReport): number {
  return report.ios.accepted + report.android.accepted;
}
function failureSummary(result: { reason: string; status?: number }): string {
  if (result.status) return `Provider returned HTTP ${result.status}`;
  if (result.reason === "fcm_auth_failed") return "Firebase authentication failed";
  if (result.reason === "apns_request_timeout") return "Apple request timed out";
  return "Provider request failed";
}

/**
 * Sends a native push to every eligible iOS/Android device the user owns.
 * Respects the user's push preference and prunes stale device tokens.
 */
async function deliverPushToUser(
  db: SupabaseClient,
  recipientUserId: string,
  content: PushContent,
): Promise<PushDeliveryReport> {
  const report = deliveryReport();
  const { data: prefs } = await db
    .from("notification_preferences")
    .select("push_notifications")
    .eq("user_id", recipientUserId)
    .maybeSingle();

  if (prefs && prefs.push_notifications === false) return { ...report, skipped: "disabled" };

  const { data: tokens, error: tokenErr } = await db
    .from("push_device_tokens")
    .select("id, token, platform")
    .eq("user_id", recipientUserId);

  if (tokenErr || !tokens?.length) return { ...report, skipped: tokenErr ? "device_lookup_failed" : "no_devices" };
  for (const row of tokens as DeviceTokenRow[]) {
    if (row.platform === "ios" || row.platform === "android") report[row.platform].registered += 1;
  }

  const payload = {
    ...content,
    badgeCount: await unreadNotificationCount(db, recipientUserId),
  };
  const staleTokenIds: string[] = [];

  for (const row of tokens as DeviceTokenRow[]) {
    if (row.platform === "ios") {
      if (!isApnsConfigured()) continue;
      report.ios.attempted += 1;
      const result = await sendApnsPush(row.token, payload);
      if (result.ok) {
        report.ios.accepted += 1;
        continue;
      }
      report.ios.failures.push(failureSummary(result));
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
      report.android.attempted += 1;
      const result = await sendFcmPush(row.token, payload);
      if (result.ok) {
        report.android.accepted += 1;
        continue;
      }
      report.android.failures.push(failureSummary(result));
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

  return report;
}

export async function dispatchPushForNotification(
  db: SupabaseClient,
  input: CreateNotificationInput,
  notificationId?: string | null,
): Promise<PushDeliveryReport> {
  if (!isPushEligibleNotificationType(input.type)) return { ...deliveryReport(), skipped: "excluded" };
  if (!isNativePushConfigured()) {
    warnPushMissingOnce();
    return { ...deliveryReport(), skipped: "not_configured" };
  }

  if (notificationId) {
    const { data: existing } = await db
      .from("notifications")
      .select("pushed_at")
      .eq("id", notificationId)
      .maybeSingle();
    if (existing?.pushed_at) return { ...deliveryReport(), skipped: "already_sent" };
  }

  const report = await deliverPushToUser(db, input.recipientUserId, {
    title: pushTitle(input),
    body: pushBody(input),
    link: input.link ?? null,
  });

  if (acceptedCount(report) > 0 && notificationId) {
    await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", notificationId);
  }
  return report;
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

  const report = await deliverPushToUser(db, row.recipient_user_id, {
    title,
    body,
    link: row.link ?? null,
  });

  await db
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", row.id);

  return { pushed: acceptedCount(report) > 0 };
}
