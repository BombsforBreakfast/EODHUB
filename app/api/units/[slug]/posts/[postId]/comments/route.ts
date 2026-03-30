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

async function getUnitMembership(
  adminClient: ReturnType<typeof createClient>,
  unitId: string,
  userId: string
) {
  return adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", unitId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; postId: string } }
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
  const { postId } = params;

  const { data: post, error: postError } = await adminClient
    .from("unit_posts")
    .select("id, unit_id")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { data: membership } = await getUnitMembership(
    adminClient,
    post.unit_id,
    user.id
  );

  if (!membership || membership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: commentRows, error: commentsError } = await adminClient
    .from("unit_post_comments")
    .select("*")
    .eq("unit_post_id", postId)
    .order("created_at", { ascending: true });

  if (commentsError) {
    return NextResponse.json({ error: commentsError.message }, { status: 500 });
  }

  const comments = commentRows ?? [];

  if (comments.length === 0) {
    return NextResponse.json({ comments: [] });
  }

  const authorIds = [...new Set(comments.map((c: { user_id: string }) => c.user_id))];

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, photo_url")
    .in("user_id", authorIds);

  const profileMap: Record<string, Profile> = {};
  for (const p of profiles ?? []) {
    profileMap[p.user_id] = p;
  }

  const enriched = comments.map((c: { user_id: string } & Record<string, unknown>) => {
    const profile = profileMap[c.user_id];
    const authorName =
      profile?.display_name ||
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      "Unknown";
    return {
      ...c,
      author_name: authorName,
      author_photo: profile?.photo_url ?? null,
    };
  });

  return NextResponse.json({ comments: enriched });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; postId: string } }
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
  const { postId } = params;

  const { data: post, error: postError } = await adminClient
    .from("unit_posts")
    .select("id, unit_id")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { data: membership } = await getUnitMembership(
    adminClient,
    post.unit_id,
    user.id
  );

  if (!membership || membership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { content } = body as { content?: string };

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const { data: comment, error: insertError } = await adminClient
    .from("unit_post_comments")
    .insert({
      unit_post_id: postId,
      user_id: user.id,
      content: content.trim(),
    })
    .select()
    .single();

  if (insertError || !comment) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create comment" },
      { status: 500 }
    );
  }

  return NextResponse.json({ comment }, { status: 201 });
}
