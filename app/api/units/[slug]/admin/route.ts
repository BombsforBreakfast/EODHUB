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

async function resolveUnitAndCheckAdmin(req: NextRequest, slug: string) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { error: "Unauthorized", status: 401 } as const;

  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return { error: "Unauthorized", status: 401 } as const;

  const db = getAdminClient();

  const { data: unit, error: unitError } = await db
    .from("units")
    .select("*")
    .eq("slug", slug)
    .single();

  if (unitError || !unit) return { error: "Unit not found", status: 404 } as const;

  const { data: membership } = await db
    .from("unit_members")
    .select("role, status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !membership ||
    membership.status !== "approved" ||
    !["owner", "admin"].includes(membership.role)
  ) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { unit, user, db, membership };
}

// GET — return pending members, approved members, and photo posts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await resolveUnitAndCheckAdmin(req, slug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { unit, db } = result;

  // Pending members
  const { data: pendingRows } = await db
    .from("unit_members")
    .select("user_id, role, created_at, invited_by")
    .eq("unit_id", unit.id)
    .eq("status", "pending");

  // Approved members
  const { data: memberRows } = await db
    .from("unit_members")
    .select("user_id, role, created_at, invited_by")
    .eq("unit_id", unit.id)
    .eq("status", "approved");

  // Photo posts
  const { data: photoPosts } = await db
    .from("unit_posts")
    .select("id, user_id, content, photo_url, created_at")
    .eq("unit_id", unit.id)
    .not("photo_url", "is", null)
    .order("created_at", { ascending: false });

  // Collect all user ids to fetch profiles for
  const allUserIds = [
    ...new Set([
      ...(pendingRows ?? []).map((r: { user_id: string }) => r.user_id),
      ...(memberRows ?? []).map((r: { user_id: string }) => r.user_id),
      ...(photoPosts ?? []).map((r: { user_id: string }) => r.user_id),
    ]),
  ];

  const profileMap: Record<string, { display_name: string | null; first_name: string | null; last_name: string | null; photo_url: string | null; service: string | null; role: string | null }> = {};
  if (allUserIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url, service, role")
      .in("user_id", allUserIds);
    for (const p of profiles ?? []) {
      profileMap[p.user_id] = p;
    }
  }

  function getName(userId: string) {
    const p = profileMap[userId];
    return p?.display_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Unknown";
  }

  const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

  const pending = (pendingRows ?? []).map((r: { user_id: string; role: string; created_at: string; invited_by: string | null }) => ({
    user_id: r.user_id,
    role: r.role,
    requested_at: r.created_at,
    display_name: getName(r.user_id),
    photo_url: profileMap[r.user_id]?.photo_url ?? null,
    service: profileMap[r.user_id]?.service ?? null,
    job_title: profileMap[r.user_id]?.role ?? null,
  }));

  const members = (memberRows ?? [])
    .map((r: { user_id: string; role: string; created_at: string; invited_by: string | null }) => ({
      user_id: r.user_id,
      role: r.role,
      joined_at: r.created_at,
      display_name: getName(r.user_id),
      photo_url: profileMap[r.user_id]?.photo_url ?? null,
      service: profileMap[r.user_id]?.service ?? null,
      job_title: profileMap[r.user_id]?.role ?? null,
    }))
    .sort((a: { role: string }, b: { role: string }) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));

  const photos = (photoPosts ?? []).map((p: { id: string; user_id: string; content: string | null; photo_url: string | null; created_at: string }) => ({
    id: p.id,
    user_id: p.user_id,
    content: p.content,
    photo_url: p.photo_url,
    created_at: p.created_at,
    author_name: getName(p.user_id),
    author_photo: profileMap[p.user_id]?.photo_url ?? null,
  }));

  return NextResponse.json({ unit, pending, members, photos });
}

// PATCH — admin actions
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await resolveUnitAndCheckAdmin(req, slug);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { unit, db, membership } = result;
  const isOwner = membership.role === "owner";

  const body = await req.json() as {
    action: "approve_member" | "deny_member" | "remove_member" | "change_role" | "delete_post";
    user_id?: string;
    post_id?: string;
    role?: string;
  };

  const { action } = body;

  if (action === "approve_member") {
    const { user_id } = body;
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    await db.from("unit_members").update({ status: "approved" }).eq("unit_id", unit.id).eq("user_id", user_id);
    // Remove join request post
    await db.from("unit_posts").delete().eq("unit_id", unit.id).eq("user_id", user_id).eq("post_type", "join_request");
    // Notify user
    await db.from("notifications").insert({
      user_id,
      type: "unit_join_approval",
      message: `Your request to join ${unit.name} was approved`,
      actor_name: unit.name,
      unit_id: unit.id,
      post_owner_id: null,
      metadata: { unit_slug: slug },
      is_read: false,
    });
    return NextResponse.json({ success: true });
  }

  if (action === "deny_member") {
    const { user_id } = body;
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    await db.from("unit_members").delete().eq("unit_id", unit.id).eq("user_id", user_id);
    await db.from("unit_posts").delete().eq("unit_id", unit.id).eq("user_id", user_id).eq("post_type", "join_request");
    await db.from("unit_join_approvals").delete().eq("unit_id", unit.id).eq("requester_user_id", user_id);
    return NextResponse.json({ success: true });
  }

  if (action === "remove_member") {
    const { user_id } = body;
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    // Check target role — can't remove the owner
    const { data: targetMember } = await db.from("unit_members").select("role").eq("unit_id", unit.id).eq("user_id", user_id).maybeSingle();
    if (targetMember?.role === "owner") {
      return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 });
    }
    // Admins can only remove regular members; owners can remove anyone
    if (!isOwner && targetMember?.role === "admin") {
      return NextResponse.json({ error: "Only the owner can remove admins" }, { status: 403 });
    }
    await db.from("unit_members").delete().eq("unit_id", unit.id).eq("user_id", user_id);
    return NextResponse.json({ success: true });
  }

  if (action === "change_role") {
    const { user_id, role } = body;
    if (!user_id || !role) return NextResponse.json({ error: "user_id and role required" }, { status: 400 });
    if (!["admin", "member"].includes(role)) return NextResponse.json({ error: "Role must be admin or member" }, { status: 400 });
    if (!isOwner) return NextResponse.json({ error: "Only the owner can change roles" }, { status: 403 });
    const { data: targetMember } = await db.from("unit_members").select("role").eq("unit_id", unit.id).eq("user_id", user_id).maybeSingle();
    if (targetMember?.role === "owner") return NextResponse.json({ error: "Cannot change owner role" }, { status: 403 });
    await db.from("unit_members").update({ role }).eq("unit_id", unit.id).eq("user_id", user_id);
    return NextResponse.json({ success: true });
  }

  if (action === "delete_post") {
    const { post_id } = body;
    if (!post_id) return NextResponse.json({ error: "post_id required" }, { status: 400 });
    await db.from("unit_posts").delete().eq("id", post_id).eq("unit_id", unit.id);
    await db.from("unit_post_likes").delete().eq("unit_post_id", post_id);
    await db.from("unit_post_comments").delete().eq("unit_post_id", post_id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
