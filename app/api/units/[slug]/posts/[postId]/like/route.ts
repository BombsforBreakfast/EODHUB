import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertMemberInteractionAllowed } from "../../../../../../lib/memberSubscriptionServer";
import { fetchActorName, maybeNotifyUnitHotEngagement } from "../../../../../../lib/unitNotificationsServer";

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
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
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
  const { postId, slug: slugParam } = await params;

  const { data: post, error: postError } = await adminClient
    .from("unit_posts")
    .select("id, unit_id, user_id")
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

  const gate = await assertMemberInteractionAllowed(adminClient, user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
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

  const { data: unitRow } = await adminClient
    .from("units")
    .select("id, name, slug")
    .eq("id", post.unit_id)
    .maybeSingle();
  const unitName = (unitRow as { name?: string } | null)?.name ?? "your group";
  const unitSlug = (unitRow as { slug?: string } | null)?.slug ?? slugParam;

  let pending_like_notify: Record<string, unknown> | null = null;
  if (liked && post.user_id !== user.id) {
    const actorName = await fetchActorName(adminClient, user.id);
    pending_like_notify = {
      user_id: post.user_id,
      actor_name: actorName,
      post_owner_id: post.user_id,
      message: `${actorName} liked your post in ${unitName}`,
      type: "unit_post_like",
      category: "group",
      entity_type: "unit_post",
      entity_id: postId,
      link: `/units/${encodeURIComponent(unitSlug)}?unitPostId=${encodeURIComponent(postId)}`,
      group_key: `unit_post:${postId}:likes`,
      dedupe_key: `unit_post_like:${postId}:${user.id}`,
      metadata: { unit_slug: unitSlug, unit_id: post.unit_id, unit_post_id: postId },
    };
  }

  if (liked) {
    await maybeNotifyUnitHotEngagement(adminClient, {
      postId,
      unitId: post.unit_id,
      unitSlug,
      unitName,
      postAuthorId: post.user_id,
      actorUserId: user.id,
    });
  }

  const { count } = await adminClient
    .from("unit_post_likes")
    .select("id", { count: "exact", head: true })
    .eq("unit_post_id", postId);

  return NextResponse.json({ liked, like_count: count ?? 0, pending_like_notify });
}
