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
  const { slug } = await params;

  const { data: unit, error: unitError } = await adminClient
    .from("units")
    .select("*")
    .eq("slug", slug)
    .single();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { data: existingMember } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMember) {
    if (existingMember.status === "approved") {
      return NextResponse.json({ error: "Already a member" }, { status: 409 });
    }
    if (existingMember.status === "pending") {
      return NextResponse.json(
        { error: "Request already pending" },
        { status: 409 }
      );
    }
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("first_name, last_name, display_name, photo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const name =
    profile?.display_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    "A member";

  const { error: memberInsertError } = await adminClient
    .from("unit_members")
    .insert({
      unit_id: unit.id,
      user_id: user.id,
      role: "member",
      status: "pending",
    });

  if (memberInsertError) {
    return NextResponse.json(
      { error: memberInsertError.message },
      { status: 500 }
    );
  }

  const { error: postInsertError } = await adminClient
    .from("unit_posts")
    .insert({
      unit_id: unit.id,
      user_id: user.id,
      post_type: "join_request",
      content: `${name} is requesting to join`,
      meta: {
        requester_id: user.id,
        requester_name: name,
        avatar_url: profile?.photo_url ?? null,
      },
    });

  if (postInsertError) {
    return NextResponse.json(
      { error: postInsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
