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
    .select("id, user_id, body, gif_url, tag, created_at, expires_at")
    .eq("room_id", CHATROOM_ROOM_ID)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const visible = (rows ?? []).filter((row) => !blocked.has(row.user_id));
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

  const messages: ChatroomMessageDto[] = visible.map((row) => {
    const p = profilesById.get(row.user_id);
    const name =
      p?.display_name?.trim()
      || `${p?.first_name || ""} ${p?.last_name || ""}`.trim()
      || "Member";
    return {
      id: row.id,
      user_id: row.user_id,
      body: row.body,
      gif_url: row.gif_url ?? null,
      tag: row.tag,
      created_at: row.created_at,
      expires_at: row.expires_at,
      author_name: name,
      author_photo_url: p?.photo_url ?? null,
      author_service: p?.service ?? null,
      author_is_employer: p?.is_employer ?? null,
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

  let body: { body?: string; tag?: string | null; gif_url?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  const gifUrlRaw = typeof body.gif_url === "string" ? body.gif_url.trim() : "";
  const gif_url = gifUrlRaw && /^https:\/\//i.test(gifUrlRaw) ? gifUrlRaw : null;

  if (!text && !gif_url) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  const displayText = text ? mentionsToDisplayText(text) : "";
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
      body: text || "",
      gif_url,
      tag,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id, user_id, body, gif_url, tag, created_at, expires_at")
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
    gif_url: inserted.gif_url ?? null,
    tag: inserted.tag,
    created_at: inserted.created_at,
    expires_at: inserted.expires_at,
    author_name: authorName,
    author_photo_url: author?.photo_url ?? null,
    author_service: author?.service ?? null,
    author_is_employer: author?.is_employer ?? null,
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

async function requireChatroomUser(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { auth, admin, profile };
}

function parseMessagePayload(raw: { body?: string; gif_url?: string | null }) {
  const text = typeof raw.body === "string" ? raw.body.trim() : "";
  const gifUrlRaw = typeof raw.gif_url === "string" ? raw.gif_url.trim() : "";
  const gif_url = gifUrlRaw && /^https:\/\//i.test(gifUrlRaw) ? gifUrlRaw : null;
  return { text, gif_url };
}

export async function PATCH(req: NextRequest) {
  const gate = await requireChatroomUser(req);
  if ("error" in gate && gate.error) return gate.error;
  const { auth, admin } = gate;

  let payload: { id?: string; body?: string; gif_url?: string | null };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { text, gif_url } = parseMessagePayload(payload);
  if (!text && !gif_url) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  const displayText = text ? mentionsToDisplayText(text) : "";
  if (displayText.length > CHATROOM_MESSAGE_MAX_LEN) {
    return NextResponse.json({ error: `Message max ${CHATROOM_MESSAGE_MAX_LEN} characters.` }, { status: 400 });
  }
  if (text.length > CHATROOM_MESSAGE_RAW_MAX_LEN) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  const { data: existing, error: lookupErr } = await auth.userClient
    .from("chatroom_messages")
    .select("id, user_id, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (existing.user_id !== auth.user.id) {
    return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Message has expired." }, { status: 410 });
  }

  const { data: updated, error } = await auth.userClient
    .from("chatroom_messages")
    .update({ body: text || "", gif_url })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id, user_id, body, gif_url, tag, created_at, expires_at")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || "Failed to update" }, { status: 500 });
  }

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
    id: updated.id,
    user_id: updated.user_id,
    body: updated.body,
    gif_url: updated.gif_url ?? null,
    tag: updated.tag,
    created_at: updated.created_at,
    expires_at: updated.expires_at,
    author_name: authorName,
    author_photo_url: author?.photo_url ?? null,
    author_service: author?.service ?? null,
    author_is_employer: author?.is_employer ?? null,
  };

  return NextResponse.json({ message });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireChatroomUser(req);
  if ("error" in gate && gate.error) return gate.error;
  const { auth } = gate;

  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: existing, error: lookupErr } = await auth.userClient
    .from("chatroom_messages")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (existing.user_id !== auth.user.id) {
    return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
  }

  const { error } = await auth.userClient
    .from("chatroom_messages")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
