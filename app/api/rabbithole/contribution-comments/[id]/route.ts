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

async function resolveActor(token: string) {
  const userClient = getUserClient(token);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return { user, admin, isAdmin: !!profile?.is_admin } as const;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = req.headers.get("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveActor(token);
  if ("error" in actor) return actor.error;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  if (!body || typeof body.body !== "string") {
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
  }
  const trimmed = body.body.trim();
  if (!trimmed) return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  if (trimmed.length > 1200) return NextResponse.json({ error: "Comment is too long" }, { status: 400 });

  const { data: row, error: lookupErr } = await actor.admin
    .from("rabbithole_contribution_comments")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Edit is author-only on purpose: admins should remove, not rewrite.
  if (row.user_id !== actor.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updErr } = await actor.admin
    .from("rabbithole_contribution_comments")
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = req.headers.get("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveActor(token);
  if ("error" in actor) return actor.error;

  const { id } = await params;
  const { data: row, error: lookupErr } = await actor.admin
    .from("rabbithole_contribution_comments")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = row.user_id === actor.user.id;
  if (!isAuthor && !actor.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete: existing select policies already filter deleted_at IS NOT NULL.
  const { error: delErr } = await actor.admin
    .from("rabbithole_contribution_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, removedBy: actor.isAdmin && !isAuthor ? "admin" : "author" });
}
