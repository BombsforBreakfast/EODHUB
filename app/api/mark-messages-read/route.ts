import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let conversationId: string | undefined;
  try {
    const text = await req.text();
    if (text.trim()) {
      const j = JSON.parse(text) as { conversation_id?: string };
      if (typeof j.conversation_id === "string" && j.conversation_id.length > 0) {
        conversationId = j.conversation_id;
      }
    }
  } catch {
    /* ignore invalid body */
  }

  if (conversationId) {
    const { data: conv } = await adminClient
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .maybeSingle();

    if (!conv) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await adminClient
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conversationId)
      .neq("sender_id", user.id)
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, scope: "conversation" });
  }

  // Legacy: mark all unread in all accepted conversations (avoid when possible)
  const { data: convs } = await adminClient
    .from("conversations")
    .select("id")
    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
    .eq("status", "accepted");

  const convIds = (convs ?? []).map((c: { id: string }) => c.id);

  if (convIds.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const { error } = await adminClient
    .from("messages")
    .update({ is_read: true })
    .in("conversation_id", convIds)
    .neq("sender_id", user.id)
    .eq("is_read", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, scope: "all" });
}
