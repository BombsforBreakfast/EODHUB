import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertAdmin(token: string) {
  const userClient = getUserClient(token);
  const admin = getAdminClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminProfile?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { admin };
}

async function maybeUnhide(admin: ReturnType<typeof getAdminClient>, contentType: string, contentId: string) {
  const { count, error } = await admin
    .from("flags")
    .select("*", { count: "exact", head: true })
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .eq("reviewed", false);
  if (error) return;
  if (count !== null && count > 0) return;

  const table =
    contentType === "post" ? "posts" : contentType === "comment" ? "post_comments" : contentType === "message" ? "messages" : null;
  if (!table) return;

  await admin.from(table).update({ hidden_for_review: false }).eq("id", contentId);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const auth = await assertAdmin(token);
  if ("error" in auth) return auth.error;

  let body: { flagId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { flagId, action } = body;
  if (!flagId || typeof flagId !== "string") {
    return NextResponse.json({ error: "Missing flagId" }, { status: 400 });
  }
  if (action !== "dismiss" && action !== "remove") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: flag, error: flagErr } = await auth.admin.from("flags").select("*").eq("id", flagId).maybeSingle();
  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }
  if (!flag) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  const contentType = flag.content_type as string;
  const contentId = flag.content_id as string;

  if (action === "remove") {
    const table =
      contentType === "post" ? "posts" : contentType === "comment" ? "post_comments" : contentType === "message" ? "messages" : null;
    if (!table) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }
    const { error: delErr } = await auth.admin.from(table).delete().eq("id", contentId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    await auth.admin.from("flags").update({ reviewed: true }).eq("content_type", contentType).eq("content_id", contentId);
    return NextResponse.json({ ok: true });
  }

  const { error: updErr } = await auth.admin.from("flags").update({ reviewed: true }).eq("id", flagId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  await maybeUnhide(auth.admin, contentType, contentId);
  return NextResponse.json({ ok: true });
}
