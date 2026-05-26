import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/app/lib/notificationsServer";
import { hasFullPlatformAccess } from "@/app/lib/verificationAccess";
import {
  getWelcomeSidebarExemptUserIds,
  getWelcomeSidebarSenderUserId,
  isWelcomeSidebarSystemAccount,
  WELCOME_SIDEBAR_MESSAGE,
  welcomeSidebarDedupeKey,
} from "@/app/lib/welcomeSidebarMessage";

export type EnsureWelcomeSidebarReason =
  | "sent"
  | "already_sent"
  | "no_access"
  | "self"
  | "already_engaged"
  | "exempt_list"
  | "system_account"
  | "sender_not_configured"
  | "profile_missing"
  | "error";

export type EnsureWelcomeSidebarResult = {
  sent: boolean;
  reason: EnsureWelcomeSidebarReason;
  conversationId?: string;
  messageId?: string;
  error?: string;
};

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function markWelcomeSidebarHandled(
  adminClient: SupabaseClient,
  recipientUserId: string,
): Promise<void> {
  await adminClient
    .from("profiles")
    .update({ welcome_sidebar_sent_at: new Date().toISOString() })
    .eq("user_id", recipientUserId);
}

async function findExistingConversation(
  adminClient: SupabaseClient,
  senderUserId: string,
  recipientUserId: string,
): Promise<{ id: string; status: string } | null> {
  const [p1, p2] = sortedPair(senderUserId, recipientUserId);
  const { data, error } = await adminClient
    .from("conversations")
    .select("id, status")
    .eq("participant_1", p1)
    .eq("participant_2", p2)
    .neq("status", "declined")
    .maybeSingle();

  if (error || !data?.id) return null;
  return { id: data.id as string, status: data.status as string };
}

async function senderAlreadyMessagedRecipient(
  adminClient: SupabaseClient,
  senderUserId: string,
  recipientUserId: string,
  conversationId?: string | null,
): Promise<boolean> {
  let convId = conversationId ?? null;
  if (!convId) {
    const conv = await findExistingConversation(adminClient, senderUserId, recipientUserId);
    convId = conv?.id ?? null;
  }
  if (!convId) return false;

  const { count, error: msgErr } = await adminClient
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", convId)
    .eq("sender_id", senderUserId);

  if (msgErr) return false;
  return (count ?? 0) > 0;
}

async function resolveSenderDisplayName(
  adminClient: SupabaseClient,
  senderUserId: string,
): Promise<string> {
  const { data } = await adminClient
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", senderUserId)
    .maybeSingle();

  const row = data as {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;

  return (
    row?.display_name?.trim() ||
    `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim() ||
    "EOD HUB"
  );
}

/**
 * Idempotent founder welcome Sidebar DM + notification.
 * Skips users the sender has already messaged (manual engagement exempt).
 */
export async function ensureWelcomeSidebarMessage(
  adminClient: SupabaseClient,
  recipientUserId: string,
): Promise<EnsureWelcomeSidebarResult> {
  const senderUserId = getWelcomeSidebarSenderUserId();
  if (!senderUserId) {
    return { sent: false, reason: "sender_not_configured" };
  }

  if (recipientUserId === senderUserId) {
    return { sent: false, reason: "self" };
  }

  const { data: profile, error: profileErr } = await adminClient
    .from("profiles")
    .select(
      "user_id, email, email_verified, admin_verified, verification_status, welcome_sidebar_sent_at, is_pure_admin",
    )
    .eq("user_id", recipientUserId)
    .maybeSingle();

  if (profileErr) {
    return { sent: false, reason: "error", error: profileErr.message };
  }
  if (!profile) {
    return { sent: false, reason: "profile_missing" };
  }

  if (profile.welcome_sidebar_sent_at) {
    return { sent: false, reason: "already_sent" };
  }

  if (!hasFullPlatformAccess(profile)) {
    return { sent: false, reason: "no_access" };
  }

  if (isWelcomeSidebarSystemAccount(profile)) {
    await markWelcomeSidebarHandled(adminClient, recipientUserId);
    return { sent: false, reason: "system_account" };
  }

  const exemptIds = getWelcomeSidebarExemptUserIds();
  if (exemptIds.has(recipientUserId)) {
    await markWelcomeSidebarHandled(adminClient, recipientUserId);
    return { sent: false, reason: "exempt_list" };
  }

  const alreadyEngaged = await senderAlreadyMessagedRecipient(
    adminClient,
    senderUserId,
    recipientUserId,
  );
  if (alreadyEngaged) {
    await markWelcomeSidebarHandled(adminClient, recipientUserId);
    return { sent: false, reason: "already_engaged" };
  }

  const [p1, p2] = sortedPair(senderUserId, recipientUserId);
  const now = new Date().toISOString();

  const existingConv = await findExistingConversation(adminClient, senderUserId, recipientUserId);
  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;
    if (existingConv.status === "pending") {
      await adminClient
        .from("conversations")
        .update({ status: "accepted", last_message_at: now })
        .eq("id", conversationId);
    }
  } else {
    const { data: createdConv, error: convInsErr } = await adminClient
      .from("conversations")
      .insert({
        participant_1: p1,
        participant_2: p2,
        status: "accepted",
        initiated_by: senderUserId,
        last_message_at: now,
      })
      .select("id")
      .single();

    if (convInsErr || !createdConv?.id) {
      return {
        sent: false,
        reason: "error",
        error: convInsErr?.message ?? "Failed to create conversation",
      };
    }
    conversationId = createdConv.id as string;
  }

  const { data: insertedMsg, error: msgErr } = await adminClient
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderUserId,
      content: WELCOME_SIDEBAR_MESSAGE,
      is_read: false,
    })
    .select("id")
    .single();

  if (msgErr || !insertedMsg?.id) {
    return {
      sent: false,
      reason: "error",
      error: msgErr?.message ?? "Failed to insert welcome message",
      conversationId,
    };
  }

  const messageId = insertedMsg.id as string;
  const actorName = await resolveSenderDisplayName(adminClient, senderUserId);

  try {
    await createNotification(adminClient, {
      recipientUserId,
      actorUserId: senderUserId,
      actorName,
      postOwnerId: senderUserId,
      type: "message_received",
      category: "message",
      entityType: "thread",
      entityId: conversationId,
      parentEntityType: "message",
      parentEntityId: messageId,
      message: `${actorName} sent you a message`,
      link: "/sidebar",
      groupKey: `thread:${conversationId}:messages`,
      dedupeKey: welcomeSidebarDedupeKey(recipientUserId),
      metadata: { conversation_id: conversationId, welcome_sidebar: true },
    });
  } catch (notifyErr) {
    return {
      sent: false,
      reason: "error",
      error: notifyErr instanceof Error ? notifyErr.message : "Notification failed",
      conversationId,
      messageId,
    };
  }

  const { error: markErr } = await adminClient
    .from("profiles")
    .update({ welcome_sidebar_sent_at: now })
    .eq("user_id", recipientUserId);

  if (markErr) {
    return {
      sent: true,
      reason: "sent",
      conversationId,
      messageId,
      error: `Message sent but failed to mark profile: ${markErr.message}`,
    };
  }

  return { sent: true, reason: "sent", conversationId, messageId };
}
