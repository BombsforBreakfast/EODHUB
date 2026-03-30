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

interface Profile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
}

interface UnitPost {
  id: string;
  unit_id: string;
  user_id: string;
  post_type: string;
  content: string | null;
  photo_url: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

export async function GET(
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

  const { data: membership } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: posts, error: postsError } = await adminClient
    .from("unit_posts")
    .select("*")
    .eq("unit_id", unit.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 500 });
  }

  const unitPosts: UnitPost[] = posts ?? [];

  if (unitPosts.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  // Get unique author user_ids
  const authorIds = [...new Set(unitPosts.map((p) => p.user_id))];

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, photo_url")
    .in("user_id", authorIds);

  const profileMap: Record<string, Profile> = {};
  for (const p of profiles ?? []) {
    profileMap[p.user_id] = p;
  }

  // Get like counts
  const postIds = unitPosts.map((p) => p.id);

  const { data: likes } = await adminClient
    .from("unit_post_likes")
    .select("unit_post_id, user_id")
    .in("unit_post_id", postIds);

  const likeCountMap: Record<string, number> = {};
  const userLikedSet = new Set<string>();
  for (const like of likes ?? []) {
    likeCountMap[like.unit_post_id] = (likeCountMap[like.unit_post_id] ?? 0) + 1;
    if (like.user_id === user.id) {
      userLikedSet.add(like.unit_post_id);
    }
  }

  // Get comment counts
  const { data: comments } = await adminClient
    .from("unit_post_comments")
    .select("unit_post_id")
    .in("unit_post_id", postIds);

  const commentCountMap: Record<string, number> = {};
  for (const c of comments ?? []) {
    commentCountMap[c.unit_post_id] = (commentCountMap[c.unit_post_id] ?? 0) + 1;
  }

  // Handle join_request approval data
  const joinRequestPosts = unitPosts.filter(
    (p) => p.post_type === "join_request"
  );

  const approvalCountMap: Record<string, number> = {};
  const userVotedSet = new Set<string>();

  if (joinRequestPosts.length > 0) {
    const requesterIds = joinRequestPosts.map((p) => p.user_id);

    const { data: approvals } = await adminClient
      .from("unit_join_approvals")
      .select("requester_user_id, approver_user_id")
      .eq("unit_id", unit.id)
      .in("requester_user_id", requesterIds);

    for (const approval of approvals ?? []) {
      approvalCountMap[approval.requester_user_id] =
        (approvalCountMap[approval.requester_user_id] ?? 0) + 1;
      if (approval.approver_user_id === user.id) {
        userVotedSet.add(approval.requester_user_id);
      }
    }
  }

  const enriched = unitPosts.map((post) => {
    const profile = profileMap[post.user_id];
    const authorName =
      profile?.display_name ||
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      "Unknown";

    const base = {
      ...post,
      author_name: authorName,
      author_photo: profile?.photo_url ?? null,
      like_count: likeCountMap[post.id] ?? 0,
      comment_count: commentCountMap[post.id] ?? 0,
      user_liked: userLikedSet.has(post.id),
    };

    if (post.post_type === "join_request") {
      return {
        ...base,
        approval_count: approvalCountMap[post.user_id] ?? 0,
        user_voted: userVotedSet.has(post.user_id),
      };
    }

    return base;
  });

  return NextResponse.json({ posts: enriched });
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

  const { data: membership } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { content, photo_url } = body as {
    content?: string;
    photo_url?: string;
  };

  if (!content?.trim() && !photo_url?.trim()) {
    return NextResponse.json(
      { error: "Content or photo_url is required" },
      { status: 400 }
    );
  }

  const { data: post, error: insertError } = await adminClient
    .from("unit_posts")
    .insert({
      unit_id: unit.id,
      user_id: user.id,
      content: content?.trim() ?? null,
      photo_url: photo_url?.trim() ?? null,
      post_type: "post",
    })
    .select()
    .single();

  if (insertError || !post) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create post" },
      { status: 500 }
    );
  }

  return NextResponse.json({ post }, { status: 201 });
}
