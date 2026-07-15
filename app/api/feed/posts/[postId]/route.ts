import { NextResponse } from "next/server";
import { authenticatedUser, feedVideoAdminClient } from "../../../../lib/server/feedVideoServer";
import { deleteMuxVideosForParent } from "../../../../lib/server/deleteFeedVideos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { postId } = await params;
  const admin = feedVideoAdminClient();
  const { data: post } = await admin
    .from("posts")
    .select("id, user_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await deleteMuxVideosForParent(admin, { postId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video cleanup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const { error } = await admin.from("posts").delete().eq("id", postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
