import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyConnectionActivity } from "@/app/lib/server/notifyConnectionActivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fan out Know-graph alerts after a member posts (or shares a job from the client).
 * Job share also calls the helper server-side directly; this route covers feed composer posts.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    postId?: string;
    kind?: "posted" | "job_share";
    actorName?: string;
  } | null;

  const postId = typeof body?.postId === "string" ? body.postId.trim() : "";
  const kind = body?.kind === "job_share" ? "job_share" : "posted";
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });

  const admin = createClient(url, service);
  const { data: post } = await admin
    .from("posts")
    .select("id, user_id, post_as_user_id, content_type")
    .eq("id", postId)
    .maybeSingle();

  if (!post || post.user_id !== user.id) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Don't fan out brand/admin-as posts to the author's Know graph.
  if (post.post_as_user_id && post.post_as_user_id !== user.id) {
    return NextResponse.json({ ok: true, notified: 0, skipped: "post_as" });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const actorName =
    (typeof body?.actorName === "string" && body.actorName.trim()) ||
    profile?.display_name?.trim() ||
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    "Someone";

  const result = await notifyConnectionActivity(admin, {
    actorUserId: user.id,
    actorName,
    kind,
    postId,
  });

  return NextResponse.json({ ok: true, ...result });
}
