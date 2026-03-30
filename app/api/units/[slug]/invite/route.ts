import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = getAdminClient();
  const { slug } = params;

  const { data: unit, error: unitError } = await adminClient
    .from("units")
    .select("*")
    .eq("slug", slug)
    .single();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { data: currentMembership } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!currentMembership || currentMembership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: inviterProfile } = await adminClient
    .from("profiles")
    .select("first_name, last_name, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const inviterName =
    inviterProfile?.display_name ||
    `${inviterProfile?.first_name ?? ""} ${inviterProfile?.last_name ?? ""}`.trim() ||
    "Someone";

  const body = await req.json();
  const { user_ids } = body as { user_ids: string[] };

  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return NextResponse.json(
      { error: "user_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  // Check existing memberships in bulk
  const { data: existingMembers } = await adminClient
    .from("unit_members")
    .select("user_id")
    .eq("unit_id", unit.id)
    .in("user_id", user_ids);

  const alreadyMemberSet = new Set(
    (existingMembers ?? []).map((m: { user_id: string }) => m.user_id)
  );

  const toInvite = user_ids.filter((id) => !alreadyMemberSet.has(id));

  if (toInvite.length === 0) {
    return NextResponse.json({ invited: 0 });
  }

  // Upsert all invitees at once
  const memberInserts = toInvite.map((userId) => ({
    unit_id: unit.id,
    user_id: userId,
    role: "member",
    status: "approved",
    invited_by: user.id,
  }));

  const { data: inserted, error: upsertError } = await adminClient
    .from("unit_members")
    .upsert(memberInserts, { onConflict: "unit_id,user_id" })
    .select("user_id");

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const invitedUserIds = (inserted ?? []).map((r: { user_id: string }) => r.user_id);

  // Insert notifications for successfully invited users
  if (invitedUserIds.length > 0) {
    const notifications = invitedUserIds.map((userId: string) => ({
      user_id: userId,
      message: `${inviterName} invited you to join ${unit.name}`,
      actor_name: inviterName,
      post_owner_id: null,
      is_read: false,
    }));

    await adminClient.from("notifications").insert(notifications);
  }

  return NextResponse.json({ invited: invitedUserIds.length });
}
