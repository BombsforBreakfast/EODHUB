import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: authData.user.id };
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { postId } = await params;
  const id = (postId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const supabase = adminClient();

  const { data: postRow, error: postErr } = await supabase
    .from("posts")
    .select("id, news_item_id")
    .eq("id", id)
    .maybeSingle();

  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }
  if (!postRow?.id) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { error: deleteErr } = await supabase
    .from("posts")
    .delete()
    .eq("id", id);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  if (postRow.news_item_id) {
    const nowIso = new Date().toISOString();
    const { error: newsErr } = await supabase
      .from("news_items")
      .update({
        status: "rejected",
        reviewed_at: nowIso,
        reviewed_by: auth.userId,
        shadow_post_id: null,
        release_at: null,
      })
      .eq("id", postRow.news_item_id);
    if (newsErr) {
      return NextResponse.json(
        { error: `Post deleted, but failed to sync linked news item: ${newsErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

