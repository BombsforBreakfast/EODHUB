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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = getUserClient(token);
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { id } = await params;

  const [{ data: thread, error: lookupErr }, { data: profile }] = await Promise.all([
    admin
      .from("rabbithole_threads")
      .select("id, author_id, promoted_from_post_id, promoted_from_unit_post_id")
      .eq("id", id)
      .maybeSingle(),
    admin.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle(),
  ]);
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = !!profile?.is_admin;
  const isAuthor = thread.author_id === user.id;
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Clear back-references on the underlying source post(s) so the "Promoted to
  // RabbitHole" provenance disappears once the thread is removed.
  if (thread.promoted_from_post_id) {
    await admin
      .from("posts")
      .update({ rabbithole_thread_id: null })
      .eq("id", thread.promoted_from_post_id);
  }
  if (thread.promoted_from_unit_post_id) {
    await admin
      .from("unit_posts")
      .update({ rabbithole_thread_id: null })
      .eq("id", thread.promoted_from_unit_post_id);
  }

  const { error: delErr } = await admin.from("rabbithole_threads").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, removedBy: isAdmin && !isAuthor ? "admin" : "author" });
}
