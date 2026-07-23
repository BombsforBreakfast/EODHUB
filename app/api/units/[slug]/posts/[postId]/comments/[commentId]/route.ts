import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertMemberInteractionAllowed } from "../../../../../../../lib/memberSubscriptionServer";
import { assertApprovedUnitMember } from "../../../../../../../lib/unitAccessServer";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

async function getAuthorizedComment(
  req: NextRequest,
  slug: string,
  postId: string,
  commentId: string,
) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return { error: "Unauthorized" as const, status: 401 as const };

  const userClient = getUserClient(token);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return { error: "Unauthorized" as const, status: 401 as const };

  const adminClient = getAdminClient();
  const { data: unit, error: unitError } = await adminClient
    .from("units")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (unitError || !unit) return { error: "Unit not found" as const, status: 404 as const };

  const access = await assertApprovedUnitMember(adminClient, unit.id, user.id);
  if (!access.ok) return { error: "Forbidden" as const, status: 403 as const };

  const { data: post, error: postError } = await adminClient
    .from("unit_posts")
    .select("id, unit_id")
    .eq("id", postId)
    .eq("unit_id", unit.id)
    .maybeSingle();
  if (postError) return { error: postError.message, status: 500 as const };
  if (!post) return { error: "Post not found" as const, status: 404 as const };

  const { data: comment, error: commentError } = await adminClient
    .from("unit_post_comments")
    .select("id, unit_post_id, user_id")
    .eq("id", commentId)
    .eq("unit_post_id", postId)
    .maybeSingle();
  if (commentError) return { error: commentError.message, status: 500 as const };
  if (!comment) return { error: "Comment not found" as const, status: 404 as const };
  if (comment.user_id !== user.id) return { error: "Forbidden" as const, status: 403 as const };

  return { adminClient, userId: user.id, comment };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string; commentId: string }> },
) {
  const { slug, postId, commentId } = await params;
  const auth = await getAuthorizedComment(req, slug, postId, commentId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const gate = await assertMemberInteractionAllowed(auth.adminClient, auth.userId);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { content?: string };
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  const { error } = await auth.adminClient
    .from("unit_post_comments")
    .update({ content })
    .eq("id", commentId)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string; commentId: string }> },
) {
  const { slug, postId, commentId } = await params;
  const auth = await getAuthorizedComment(req, slug, postId, commentId);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.adminClient
    .from("unit_post_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
