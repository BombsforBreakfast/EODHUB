import type { SupabaseClient } from "@supabase/supabase-js";
import { isPushEligibleNotificationType } from "../pushEligibleTypes";
import type { CreateNotificationInput } from "../notificationsServer";
import { sendApnsPush, isApnsConfigured } from "./apnsSend";

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

export async function dispatchPushForNotification(
  db: SupabaseClient,
  input: CreateNotificationInput,
  notificationId?: string | null,
): Promise<void> {
  if (!isPushEligibleNotificationType(input.type)) return;
  if (!isApnsConfigured()) return;

  const { data: prefs } = await db
    .from("notification_preferences")
    .select("push_notifications")
    .eq("user_id", input.recipientUserId)
    .maybeSingle();

  if (prefs && prefs.push_notifications === false) return;

  const { data: tokens, error: tokenErr } = await db
    .from("push_device_tokens")
    .select("id, token, platform")
    .eq("user_id", input.recipientUserId)
    .eq("platform", "ios");

  if (tokenErr || !tokens?.length) return;

  const title = pushTitle(input);
  const body = pushBody(input);
  const link = input.link ?? null;

  const staleTokenIds: string[] = [];
  let sentCount = 0;

  for (const row of tokens) {
    const result = await sendApnsPush(row.token, { title, body, link });
    if (result.ok) {
      sentCount += 1;
      continue;
    }
    if (result.status === 410 || result.status === 400) {
      staleTokenIds.push(row.id);
    }
    console.warn("[pushDispatch] APNs send failed", {
      userId: input.recipientUserId,
      tokenId: row.id,
      reason: result.reason,
      status: result.status,
    });
  }

  if (staleTokenIds.length > 0) {
    await db.from("push_device_tokens").delete().in("id", staleTokenIds);
  }

  if (sentCount > 0 && notificationId) {
    await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", notificationId);
  }
}
