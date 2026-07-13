import type { SupabaseClient } from "@supabase/supabase-js";
import { isApnsConfigured, sendApnsPush } from "./apnsSend";

export type PushCampaignRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  scheduled_for: string;
  status: "scheduled" | "processing" | "sent" | "failed" | "canceled";
  sent_count: number;
  failed_count: number;
  invalid_token_count: number;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
};

type DeviceTokenRow = {
  id: string;
  user_id: string;
  token: string;
};

const TOKEN_PAGE_SIZE = 1000;
const APNS_CONCURRENCY = 12;

function isInvalidDeviceToken(result: { ok: false; reason: string; status?: number }): boolean {
  if (result.status === 410) return true;
  return /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/i.test(result.reason);
}

async function loadEligibleIosTokens(db: SupabaseClient): Promise<DeviceTokenRow[]> {
  const tokens: DeviceTokenRow[] = [];

  for (let from = 0; ; from += TOKEN_PAGE_SIZE) {
    const { data, error } = await db
      .from("push_device_tokens")
      .select("id, user_id, token")
      .eq("platform", "ios")
      .order("id", { ascending: true })
      .range(from, from + TOKEN_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as DeviceTokenRow[];
    tokens.push(...page);
    if (page.length < TOKEN_PAGE_SIZE) break;
  }

  if (tokens.length === 0) return [];

  const disabledUsers = new Set<string>();
  const userIds = [...new Set(tokens.map((row) => row.user_id))];
  for (let index = 0; index < userIds.length; index += TOKEN_PAGE_SIZE) {
    const chunk = userIds.slice(index, index + TOKEN_PAGE_SIZE);
    const { data, error } = await db
      .from("notification_preferences")
      .select("user_id")
      .in("user_id", chunk)
      .eq("push_notifications", false);
    if (error) throw error;
    for (const row of data ?? []) disabledUsers.add(row.user_id as string);
  }

  const seenTokens = new Set<string>();
  return tokens.filter((row) => {
    if (disabledUsers.has(row.user_id) || seenTokens.has(row.token)) return false;
    seenTokens.add(row.token);
    return true;
  });
}

async function markCampaignFailed(
  db: SupabaseClient,
  campaignId: string,
  message: string,
): Promise<void> {
  await db
    .from("push_campaigns")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      last_error: message.slice(0, 2000),
    })
    .eq("id", campaignId);
}

export async function dispatchPushCampaign(
  db: SupabaseClient,
  campaign: PushCampaignRow,
): Promise<void> {
  if (!isApnsConfigured()) {
    await markCampaignFailed(
      db,
      campaign.id,
      "APNs is not configured. Add APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID, and APNS_ENV.",
    );
    return;
  }

  try {
    const tokens = await loadEligibleIosTokens(db);
    const staleTokenIds: string[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let cursor = 0;

    async function worker() {
      while (cursor < tokens.length) {
        const row = tokens[cursor++];
        if (!row) return;

        const result = await sendApnsPush(row.token, {
          title: campaign.title,
          body: campaign.body,
          link: campaign.link ?? "/",
        });

        if (result.ok) {
          sentCount += 1;
        } else {
          failedCount += 1;
          if (isInvalidDeviceToken(result)) staleTokenIds.push(row.id);
          console.warn("[pushCampaign] APNs send failed", {
            campaignId: campaign.id,
            tokenId: row.id,
            reason: result.reason,
            status: result.status,
          });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(APNS_CONCURRENCY, Math.max(tokens.length, 1)) }, () => worker()),
    );

    if (staleTokenIds.length > 0) {
      await db.from("push_device_tokens").delete().in("id", staleTokenIds);
    }

    const { error: updateError } = await db
      .from("push_campaigns")
      .update({
        status: "sent",
        sent_count: sentCount,
        failed_count: failedCount,
        invalid_token_count: staleTokenIds.length,
        completed_at: new Date().toISOString(),
        last_error: failedCount > 0 ? `${failedCount} device delivery attempt(s) failed.` : null,
      })
      .eq("id", campaign.id);
    if (updateError) throw updateError;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown push campaign failure";
    console.error("[pushCampaign] dispatch failed", { campaignId: campaign.id, message });
    await markCampaignFailed(db, campaign.id, message);
  }
}

