import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { other_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const otherId = body.other_user_id?.trim();
  if (!otherId || otherId === user.id) {
    return NextResponse.json({ error: "Invalid other_user_id" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const p1 = user.id < otherId ? user.id : otherId;
  const p2 = user.id < otherId ? otherId : user.id;

  const { data: existing, error: findErr } = await adminClient
    .from("conversations")
    .select("id, status")
    .eq("participant_1", p1)
    .eq("participant_2", p2)
    .neq("status", "declined")
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  if (existing) {
    if (existing.status === "pending") {
      await adminClient.from("conversations").update({ status: "accepted" }).eq("id", existing.id);
    }
    return NextResponse.json({ conversation_id: existing.id });
  }

  const { data: created, error: insErr } = await adminClient
    .from("conversations")
    .insert({
      participant_1: p1,
      participant_2: p2,
      status: "accepted",
      initiated_by: user.id,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to create conversation" }, { status: 500 });
  }

  return NextResponse.json({ conversation_id: created.id });
}
