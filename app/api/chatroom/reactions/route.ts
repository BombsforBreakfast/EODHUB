import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  let body: { messageId?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = body.messageId?.trim();
  const value = body.value;
  if (!messageId || (value !== "up" && value !== "down" && value !== null && value !== "clear")) {
    return NextResponse.json({ error: "Invalid messageId or value" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: message } = await admin
    .from("chatroom_messages")
    .select("id, expires_at")
    .eq("id", messageId)
    .maybeSingle();

  if (!message || new Date(message.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: existing } = await userClient
    .from("chatroom_reactions")
    .select("value")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Toggle off if same value, or clear explicitly
  if (value === "clear" || (existing && existing.value === value)) {
    const { error } = await userClient
      .from("chatroom_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ my_reaction: null });
  }

  if (value !== "up" && value !== "down") {
    return NextResponse.json({ error: "Invalid value" }, { status: 400 });
  }

  const { error } = await userClient
    .from("chatroom_reactions")
    .upsert(
      { message_id: messageId, user_id: user.id, value },
      { onConflict: "message_id,user_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ my_reaction: value });
}
