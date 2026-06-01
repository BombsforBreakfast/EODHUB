import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertMemberInteractionAllowed } from "@/app/lib/memberSubscriptionServer";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const gate = await assertMemberInteractionAllowed(adminClient, user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  const { vouchee_user_id } = await req.json();
  if (!vouchee_user_id || typeof vouchee_user_id !== "string") {
    return NextResponse.json({ error: "Missing vouchee_user_id" }, { status: 400 });
  }
  if (vouchee_user_id === user.id) {
    return NextResponse.json({ error: "Cannot dismiss yourself" }, { status: 400 });
  }

  const { error } = await adminClient
    .from("profile_vouch_dismissals")
    .upsert(
      { viewer_user_id: user.id, vouchee_user_id },
      { onConflict: "viewer_user_id,vouchee_user_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
