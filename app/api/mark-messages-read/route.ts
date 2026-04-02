import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  // Verify the user via their JWT
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use service role to bypass RLS for the update
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get all accepted conversation IDs for this user
  const { data: convs } = await adminClient
    .from("conversations")
    .select("id")
    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
    .eq("status", "accepted");

  const convIds = (convs ?? []).map((c: { id: string }) => c.id);

  if (convIds.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Mark all unread received messages as read (bypasses RLS via service role)
  const { error } = await adminClient
    .from("messages")
    .update({ is_read: true })
    .in("conversation_id", convIds)
    .neq("sender_id", user.id)
    .eq("is_read", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
