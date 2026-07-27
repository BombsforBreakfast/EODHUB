import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canAccessCollapsingCircuit, isCollapsingCircuitEnabled } from "../../../../lib/circuit";
import { FLAG_CATEGORY_LABELS, isFlagCategory, type FlagCategory } from "../../../../lib/flagCategories";
import { createNotification } from "../../../../lib/notificationsServer";
import { hasFullPlatformAccess, type VerificationProfile } from "../../../../lib/verificationAccess";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const { id } = await ctx.params;
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessCollapsingCircuit(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await req.json().catch(() => ({}))) as { category?: string };
  const category = payload.category;
  if (!category || !isFlagCategory(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const { data: post } = await admin
    .from("circuit_posts")
    .select("id, user_id, post_type, title, body")
    .eq("id", id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.user_id === user.id) {
    return NextResponse.json({ error: "You cannot report your own post." }, { status: 400 });
  }

  const { data: mediaRows } = await admin
    .from("circuit_post_media")
    .select("public_url")
    .eq("post_id", id)
    .order("sort_order", { ascending: true });

  const mediaUrls = (mediaRows ?? []).map((m) => m.public_url);
  const snapshotBody =
    post.title?.trim() ||
    post.body?.trim() ||
    (mediaUrls.length ? "[media]" : "[empty]");

  const { error: snapError } = await admin.from("circuit_flag_snapshots").insert({
    post_id: post.id,
    reporter_id: user.id,
    author_id: post.user_id,
    post_type: post.post_type,
    body: snapshotBody,
    media_urls: mediaUrls.length ? mediaUrls : null,
    category,
  });
  if (snapError) {
    return NextResponse.json({ error: snapError.message }, { status: 500 });
  }

  const { error: flagError } = await admin.from("flags").insert({
    content_type: "circuit_post",
    content_id: post.id,
    reporter_id: user.id,
    category: category as FlagCategory,
    reviewed: false,
  });
  if (flagError) {
    return NextResponse.json({ error: flagError.message }, { status: 500 });
  }

  // Soft-remove from the Circuit so others stop seeing it.
  await admin.from("circuit_posts").delete().eq("id", post.id);

  const { data: authorProfile } = await admin
    .from("profiles")
    .select("community_flag_count")
    .eq("user_id", post.user_id)
    .maybeSingle();
  const nextCount = (authorProfile?.community_flag_count ?? 0) + 1;
  await admin.from("profiles").update({ community_flag_count: nextCount }).eq("user_id", post.user_id);

  const reasonLabel = FLAG_CATEGORY_LABELS[category as FlagCategory];
  const { data: admins } = await admin.from("profiles").select("user_id").eq("is_admin", true);
  await Promise.all(
    (admins ?? [])
      .map((a) => a.user_id)
      .filter((uid): uid is string => Boolean(uid) && uid !== user.id)
      .map((adminId) =>
        createNotification(admin, {
          recipientUserId: adminId,
          actorUserId: user.id,
          type: "activity",
          category: "system",
          entityType: "circuit_post",
          entityId: post.id,
          message: `Circuit post flagged (${reasonLabel})`,
          title: "Content flagged",
          body: `Circuit post flagged (${reasonLabel})`,
          link: "/admin?tab=flags",
          groupKey: `admin:flags:circuit_post:${post.id}`,
          dedupeKey: `admin_flag:circuit_post:${post.id}:${adminId}`,
          metadata: {
            content_type: "circuit_post",
            content_id: post.id,
            category,
            reporter_id: user.id,
            body_snapshot: snapshotBody,
          },
        }).catch(() => null),
      ),
  );

  return NextResponse.json({ ok: true });
}
