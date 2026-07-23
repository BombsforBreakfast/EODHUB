import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FLAG_CATEGORY_LABELS, isFlagCategory, type FlagCategory } from "../../../lib/flagCategories";
import { mentionsToDisplayText } from "../../../lib/mentions";
import { createNotification } from "../../../lib/notificationsServer";

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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { messageId?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = body.messageId?.trim();
  const category = body.category;
  if (!messageId || !category || !isFlagCategory(category)) {
    return NextResponse.json({ error: "Invalid messageId or category" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: message } = await admin
    .from("chatroom_messages")
    .select("id, user_id, body, gif_url")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (message.user_id === user.id) {
    return NextResponse.json({ error: "You cannot report your own message" }, { status: 400 });
  }

  const snapshotBody =
    message.body?.trim()
      || (message.gif_url ? "[GIF]" : "");

  const { error: snapErr } = await admin.from("chatroom_flag_snapshots").insert({
    message_id: message.id,
    reporter_id: user.id,
    author_id: message.user_id,
    body: snapshotBody,
    gif_url: message.gif_url ?? null,
    category,
  });
  if (snapErr) {
    return NextResponse.json({ error: snapErr.message }, { status: 500 });
  }

  const { error: flagErr } = await admin.from("flags").insert({
    reporter_id: user.id,
    content_type: "chatroom_message",
    content_id: message.id,
    category: category as FlagCategory,
    reviewed: false,
  });
  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }

  // Soft-remove for room: delete the ephemeral message so others stop seeing it.
  await admin.from("chatroom_messages").delete().eq("id", message.id);

  const reasonLabel = FLAG_CATEGORY_LABELS[category as FlagCategory];

  // Match feed flag behavior: bump author's community flag count
  const { data: authorProfile } = await admin
    .from("profiles")
    .select("community_flag_count")
    .eq("user_id", message.user_id)
    .maybeSingle();
  const nextCount = (authorProfile?.community_flag_count ?? 0) + 1;
  await admin.from("profiles").update({ community_flag_count: nextCount }).eq("user_id", message.user_id);

  const { data: admins } = await admin.from("profiles").select("user_id").eq("is_admin", true);
  const { data: reporterProfile } = await admin
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const reporterName =
    reporterProfile?.display_name
    || `${reporterProfile?.first_name || ""} ${reporterProfile?.last_name || ""}`.trim()
    || "A member";

  if (admins && admins.length > 0) {
    const previewSource =
      message.body?.trim()
        ? mentionsToDisplayText(message.body)
        : message.gif_url
          ? "[GIF]"
          : "";
    const preview = previewSource.slice(0, 80);
    const ellipsis = previewSource.length > 80 ? "…" : "";
    const adminMessage = `Team Room message flagged (${reasonLabel}): “${preview}${ellipsis}”`;
    await Promise.all(
      admins.map((a: { user_id: string }) =>
        createNotification(admin, {
          recipientUserId: a.user_id,
          actorUserId: user.id,
          actorName: reporterName,
          type: "activity",
          category: "system",
          entityType: "chatroom_message",
          entityId: message.id,
          message: adminMessage,
          title: "Content flagged",
          body: adminMessage,
          link: "/admin?tab=flags",
          groupKey: `admin:flags:chatroom_message:${message.id}`,
          dedupeKey: `admin_flag:chatroom_message:${message.id}:${a.user_id}`,
          metadata: {
            content_type: "chatroom_message",
            content_id: message.id,
            category,
            reporter_id: user.id,
            body_snapshot: snapshotBody,
            gif_url: message.gif_url ?? null,
            author_id: message.user_id,
          },
        }),
      ),
    );
  }

  return NextResponse.json({ ok: true });
}
