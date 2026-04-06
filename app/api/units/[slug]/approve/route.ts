import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertMemberInteractionAllowed } from "../../../../lib/memberSubscriptionServer";

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
  { params }: { params: Promise<{ slug: string }> }
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

  const gate = await assertMemberInteractionAllowed(adminClient, user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  const { slug } = await params;

  const { data: unit, error: unitError } = await adminClient
    .from("units")
    .select("*")
    .eq("slug", slug)
    .single();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { data: approverMember } = await adminClient
    .from("unit_members")
    .select("status, role")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!approverMember || approverMember.status !== "approved") {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const isGod =
    approverMember.role === "owner" || approverMember.role === "admin";

  const body = await req.json();
  const { requester_user_id, action } = body as {
    requester_user_id: string;
    action: "vote" | "approve" | "deny";
  };

  if (!requester_user_id || !action) {
    return NextResponse.json(
      { error: "requester_user_id and action are required" },
      { status: 400 }
    );
  }

  if (action === "deny") {
    if (!isGod) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await adminClient
      .from("unit_members")
      .delete()
      .eq("unit_id", unit.id)
      .eq("user_id", requester_user_id);

    await adminClient
      .from("unit_posts")
      .delete()
      .eq("unit_id", unit.id)
      .eq("user_id", requester_user_id)
      .eq("post_type", "join_request");

    return NextResponse.json({ success: true, result: "denied" });
  }

  if (action === "approve" && isGod) {
    const { error: updateError } = await adminClient
      .from("unit_members")
      .update({ status: "approved" })
      .eq("unit_id", unit.id)
      .eq("user_id", requester_user_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await adminClient
      .from("unit_posts")
      .delete()
      .eq("unit_id", unit.id)
      .eq("user_id", requester_user_id)
      .eq("post_type", "join_request");

    return NextResponse.json({ success: true, result: "approved" });
  }

  // action === 'vote' (or approve from non-god falls through to vote)
  const { error: upsertError } = await adminClient
    .from("unit_join_approvals")
    .upsert(
      {
        unit_id: unit.id,
        requester_user_id,
        approver_user_id: user.id,
      },
      { onConflict: "unit_id,requester_user_id,approver_user_id" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { count } = await adminClient
    .from("unit_join_approvals")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unit.id)
    .eq("requester_user_id", requester_user_id);

  const voteCount = count ?? 0;

  if (voteCount >= 3) {
    await adminClient
      .from("unit_members")
      .update({ status: "approved" })
      .eq("unit_id", unit.id)
      .eq("user_id", requester_user_id);

    await adminClient
      .from("unit_posts")
      .delete()
      .eq("unit_id", unit.id)
      .eq("user_id", requester_user_id)
      .eq("post_type", "join_request");

    return NextResponse.json({
      success: true,
      result: "approved",
      votes: voteCount,
    });
  }

  return NextResponse.json({ success: true, result: "voted", votes: voteCount });
}
