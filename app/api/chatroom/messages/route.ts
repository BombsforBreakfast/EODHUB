import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CHATROOM_MESSAGE_MAX_LEN,
  CHATROOM_MESSAGE_RAW_MAX_LEN,
  CHATROOM_ROOM_ID,
  isChatroomTag,
  type ChatroomMessageDto,
} from "../../../lib/chatroom";
import { extractMentionIds, mentionsToDisplayText } from "../../../lib/mentions";
import { createNotification } from "../../../lib/notificationsServer";
import { fetchBlockedUserIds } from "../../../lib/userBlocks";
import { hasFullPlatformAccess, type VerificationProfile } from "../../../lib/verificationAccess";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;
  return { user, userClient, token };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await fetchBlockedUserIds(admin, auth.user.id);
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("chatroom_messages")
    .select("id, user_id, body, tag, created_at, expires_at")
    .eq("room_id", CHATROOM_ROOM_ID)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const visible = (rows ?? []).filter((row) => !blocked.has(row.user_id));
  const messageIds = visible.map((r) => r.id);
  const authorIds = [...new Set(visible.map((r) => r.user_id))];

  const profilesById = new Map<string, {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    service: string | null;
    is_employer: boolean | null;
  }>();

  if (authorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, photo_url, service, is_employer")
      .in("user_id", authorIds);
    for (const p of profiles ?? []) {
      profilesById.set(p.user_id, p);
    }
  }

  const reactionCounts = new Map<string, { up: number; down: number }>();
  const myReaction = new Map<string, "up" | "down">();

  if (messageIds.length > 0) {
    const { data: reactions } = await admin
      .from("chatroom_reactions")
      .select("message_id, user_id, value")
      .in("message_id", messageIds);

    for (const r of reactions ?? []) {
      const bucket = reactionCounts.get(r.message_id) ?? { up: 0, down: 0 };
      if (r.value === "up") bucket.up += 1;
      else if (r.value === "down") bucket.down += 1;
      reactionCounts.set(r.message_id, bucket);
      if (r.user_id === auth.user.id && (r.value === "up" || r.value === "down")) {
        myReaction.set(r.message_id, r.value);
      }
    }
  }

  const messages: ChatroomMessageDto[] = visible.map((row) => {
    const p = profilesById.get(row.user_id);
    const name =
      p?.display_name?.trim()
      || `${p?.first_name || ""} ${p?.last_name || ""}`.trim()
      || "Member";
    const counts = reactionCounts.get(row.id) ?? { up: 0, down: 0 };
    return {
      id: row.id,
      user_id: row.user_id,
      body: row.body,
      tag: row.tag,
      created_at: row.created_at,
      expires_at: row.expires_at,
      author_name: name,
      author_photo_url: p?.photo_url ?? null,
      author_service: p?.service ?? null,
      author_is_employer: p?.is_employer ?? null,
      up_count: counts.up,
      down_count: counts.down,
      my_reaction: myReaction.get(row.id) ?? null,
    };
  });

  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { body?: string; tag?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  const displayText = mentionsToDisplayText(text);
  if (displayText.length > CHATROOM_MESSAGE_MAX_LEN) {
    return NextResponse.json({ error: `Message max ${CHATROOM_MESSAGE_MAX_LEN} characters.` }, { status: 400 });
  }
  if (text.length > CHATROOM_MESSAGE_RAW_MAX_LEN) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  const tag = body.tag && isChatroomTag(body.tag) ? body.tag : null;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

  const { data: inserted, error } = await auth.userClient
    .from("chatroom_messages")
    .insert({
      room_id: CHATROOM_ROOM_ID,
      user_id: auth.user.id,
      body: text,
      tag,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id, user_id, body, tag, created_at, expires_at")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || "Failed to send" }, { status: 500 });
  }

  // Load display fields for response
  const { data: author } = await admin
    .from("profiles")
    .select("display_name, first_name, last_name, photo_url, service, is_employer")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const authorName =
    author?.display_name?.trim()
    || `${author?.first_name || ""} ${author?.last_name || ""}`.trim()
    || "Member";

  const message: ChatroomMessageDto = {
    id: inserted.id,
    user_id: inserted.user_id,
    body: inserted.body,
    tag: inserted.tag,
    created_at: inserted.created_at,
    expires_at: inserted.expires_at,
    author_name: authorName,
    author_photo_url: author?.photo_url ?? null,
    author_service: author?.service ?? null,
    author_is_employer: author?.is_employer ?? null,
    up_count: 0,
    down_count: 0,
    my_reaction: null,
  };

  // Tag → in-app notification + push (createNotification schedules push via after())
  const mentionIds = extractMentionIds(text).filter((id) => id !== auth.user.id);
  if (mentionIds.length > 0) {
    const blockedBySender = await fetchBlockedUserIds(admin, auth.user.id);
    await Promise.all(
      mentionIds.map(async (recipientId) => {
        if (blockedBySender.has(recipientId)) return;
        try {
          await createNotification(admin, {
            recipientUserId: recipientId,
            actorUserId: auth.user.id,
            actorName: authorName,
            type: "mention_chatroom",
            category: "social",
            entityType: "chatroom_message",
            entityId: inserted.id,
            message: `${authorName} tagged you in Team Room`,
            title: "Team Room",
            body: `${authorName} tagged you`,
            link: "/?chatroom=1",
            groupKey: `chatroom:lobby:mention:${recipientId}`,
            dedupeKey: `mention_chatroom:${inserted.id}:${recipientId}`,
            metadata: { chatroom: true, message_id: inserted.id },
          });
        } catch (notifyErr) {
          console.error("[chatroom] mention notify failed", recipientId, notifyErr);
        }
      }),
    );
  }

  return NextResponse.json({ message });
}
