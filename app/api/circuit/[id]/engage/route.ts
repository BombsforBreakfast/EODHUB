import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canAccessCollapsingCircuit, isCollapsingCircuitEnabled } from "../../../../lib/circuit";
import { createNotification } from "../../../../lib/notificationsServer";
import {
  DEFAULT_REACTION_ORDER,
  parseReactionType,
  type ReactionType,
} from "../../../../lib/reactions/types";
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

async function requireAccess(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user || !canAccessCollapsingCircuit(user.email)) return null;

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return null;
  }
  return { user, admin };
}

async function requireLivePost(admin: ReturnType<typeof getAdminClient>, postId: string) {
  const nowIso = new Date().toISOString();
  const { data: post } = await admin
    .from("circuit_posts")
    .select("id, user_id, post_type")
    .eq("id", postId)
    .gt("expires_at", nowIso)
    .maybeSingle();
  return post;
}

async function actorDisplayName(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle();
  return (
    profile?.display_name?.trim() ||
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "Member"
  );
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const { id } = await ctx.params;
  const access = await requireAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await requireLivePost(access.admin, id);
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [{ data: reactionRows }, { data: commentRows, error: commentError }] = await Promise.all([
    access.admin
      .from("content_reactions")
      .select("user_id, reaction_type")
      .eq("subject_kind", "circuit_post")
      .eq("subject_id", id),
    access.admin
      .from("circuit_comments")
      .select("id, user_id, body, created_at")
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (commentError) {
    return NextResponse.json({ error: commentError.message }, { status: 500 });
  }

  const counts: Partial<Record<ReactionType, number>> = {};
  let myReaction: ReactionType | null = null;
  for (const row of reactionRows ?? []) {
    const rt = parseReactionType(row.reaction_type);
    if (!rt) continue;
    counts[rt] = (counts[rt] ?? 0) + 1;
    if (row.user_id === access.user.id) myReaction = rt;
  }

  const authorIds = [...new Set((commentRows ?? []).map((c) => c.user_id))];
  const profilesById = new Map<
    string,
    { display_name: string | null; first_name: string | null; last_name: string | null; photo_url: string | null }
  >();
  if (authorIds.length > 0) {
    const { data: profiles } = await access.admin
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, photo_url")
      .in("user_id", authorIds);
    for (const p of profiles ?? []) profilesById.set(p.user_id, p);
  }

  const comments = (commentRows ?? []).map((c) => {
    const p = profilesById.get(c.user_id);
    const name =
      p?.display_name?.trim() ||
      `${p?.first_name || ""} ${p?.last_name || ""}`.trim() ||
      "Member";
    return {
      id: c.id,
      user_id: c.user_id,
      body: c.body,
      created_at: c.created_at,
      author_name: name,
      author_photo_url: p?.photo_url ?? null,
    };
  });

  return NextResponse.json({
    my_reaction: myReaction,
    reaction_counts: counts,
    reaction_total: Object.values(counts).reduce((a, b) => a + (b ?? 0), 0),
    reaction_order: DEFAULT_REACTION_ORDER,
    comments,
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const { id } = await ctx.params;
  const access = await requireAccess(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await requireLivePost(access.admin, id);
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const payload = (await req.json().catch(() => null)) as {
    action?: "react" | "comment";
    reaction_type?: string;
    body?: string;
  } | null;

  if (!payload?.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  if (payload.action === "react") {
    const picked = parseReactionType(payload.reaction_type);
    if (!picked) {
      return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
    }

    const { data: existing } = await access.admin
      .from("content_reactions")
      .select("id, reaction_type")
      .eq("subject_kind", "circuit_post")
      .eq("subject_id", id)
      .eq("user_id", access.user.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await access.admin.from("content_reactions").insert({
        subject_kind: "circuit_post",
        subject_id: id,
        user_id: access.user.id,
        reaction_type: picked,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (post.user_id !== access.user.id && post.post_type !== "event") {
        const actorName = await actorDisplayName(access.admin, access.user.id);
        await createNotification(access.admin, {
          recipientUserId: post.user_id,
          actorUserId: access.user.id,
          actorName,
          postOwnerId: post.user_id,
          type: "activity",
          category: "social",
          entityType: "circuit_post",
          entityId: id,
          message: `${actorName} reacted to your Circuit post`,
          title: "New Circuit reaction",
          body: `${actorName} reacted to your Circuit post`,
          link: `/?circuit=${id}`,
          groupKey: `circuit_react:${id}`,
          dedupeKey: `circuit_react:${id}:${access.user.id}:${picked}`,
        }).catch(() => null);
      }
      return NextResponse.json({ ok: true, my_reaction: picked });
    }

    const existingType = parseReactionType(existing.reaction_type);
    if (existingType === picked) {
      const { error } = await access.admin.from("content_reactions").delete().eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, my_reaction: null });
    }

    const { error } = await access.admin
      .from("content_reactions")
      .update({ reaction_type: picked })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, my_reaction: picked });
  }

  if (payload.action === "comment") {
    const text = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    }
    if (text.length > 280) {
      return NextResponse.json({ error: "Comment must be 280 characters or fewer." }, { status: 400 });
    }

    const { data: row, error } = await access.admin
      .from("circuit_comments")
      .insert({
        post_id: id,
        user_id: access.user.id,
        body: text,
      })
      .select("id, user_id, body, created_at")
      .single();

    if (error || !row) {
      return NextResponse.json({ error: error?.message || "Could not comment." }, { status: 500 });
    }

    const { data: profile } = await access.admin
      .from("profiles")
      .select("display_name, first_name, last_name, photo_url")
      .eq("user_id", access.user.id)
      .maybeSingle();

    const name =
      profile?.display_name?.trim() ||
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
      "Member";

    if (post.user_id !== access.user.id && post.post_type !== "event") {
      await createNotification(access.admin, {
        recipientUserId: post.user_id,
        actorUserId: access.user.id,
        actorName: name,
        postOwnerId: post.user_id,
        type: "activity",
        category: "social",
        entityType: "circuit_post",
        entityId: id,
        message: `${name} commented on your Circuit post`,
        title: "New Circuit comment",
        body: text.slice(0, 120),
        link: `/?circuit=${id}`,
        groupKey: `circuit_comment:${id}`,
        dedupeKey: `circuit_comment:${id}:${row.id}`,
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      comment: {
        id: row.id,
        user_id: row.user_id,
        body: row.body,
        created_at: row.created_at,
        author_name: name,
        author_photo_url: profile?.photo_url ?? null,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
