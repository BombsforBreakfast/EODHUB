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
  { params }: { params: Promise<{ slug: string; postId: string }> }
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
  const { postId } = await params;

  const { data: post, error: postError } = await adminClient
    .from("unit_posts")
    .select("id, unit_id")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { data: membership } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", post.unit_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existingLike } = await adminClient
    .from("unit_post_likes")
    .select("id")
    .eq("unit_post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  let liked: boolean;

  if (existingLike) {
    await adminClient
      .from("unit_post_likes")
      .delete()
      .eq("unit_post_id", postId)
      .eq("user_id", user.id);
    liked = false;
  } else {
    await adminClient.from("unit_post_likes").insert({
      unit_post_id: postId,
      user_id: user.id,
    });
    liked = true;
  }

  const { count } = await adminClient
    .from("unit_post_likes")
    .select("*", { count: "exact", head: true })
    .eq("unit_post_id", postId);

  return NextResponse.json({ liked, like_count: count ?? 0 });
}
