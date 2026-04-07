import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FLAG_CATEGORY_LABELS, type FlagCategory, isFlagCategory } from "../../lib/flagCategories";

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

function contentLabel(contentType: string): string {
  switch (contentType) {
    case "post":
      return "post";
    case "comment":
      return "comment";
    case "message":
      return "message";
    default:
      return "content";
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { contentType?: string; contentId?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { contentType, contentId, category } = body;
  if (!contentType || !contentId || typeof contentId !== "string") {
    return NextResponse.json({ error: "Missing contentType or contentId" }, { status: 400 });
  }
  if (contentType !== "post" && contentType !== "comment" && contentType !== "message") {
    return NextResponse.json({ error: "Invalid contentType" }, { status: 400 });
  }
  if (!category || typeof category !== "string" || !isFlagCategory(category)) {
    return NextResponse.json({ error: "Invalid or missing category" }, { status: 400 });
  }

  const admin = getAdminClient();

  let authorId: string | null = null;

  if (contentType === "post") {
    const { data: row, error } = await admin.from("posts").select("user_id").eq("id", contentId).maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    authorId = row?.user_id ?? null;
  } else if (contentType === "comment") {
    const { data: row, error } = await admin
      .from("post_comments")
      .select("user_id")
      .eq("id", contentId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    authorId = row?.user_id ?? null;
  } else {
    const { data: row, error } = await admin
      .from("messages")
      .select("sender_id")
      .eq("id", contentId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    authorId = row?.sender_id ?? null;
  }

  if (!authorId) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (authorId === user.id) {
    return NextResponse.json({ error: "You cannot flag your own content" }, { status: 400 });
  }

  const flagInsert = {
    reporter_id: user.id,
    content_type: contentType,
    content_id: contentId,
    category: category as FlagCategory,
    reviewed: false,
  };

  const { error: insertErr } = await admin.from("flags").insert([flagInsert]);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const table = contentType === "post" ? "posts" : contentType === "comment" ? "post_comments" : "messages";
  const { error: hideErr } = await admin.from(table).update({ hidden_for_review: true }).eq("id", contentId);
  if (hideErr) {
    return NextResponse.json({ error: hideErr.message }, { status: 500 });
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select("community_flag_count")
    .eq("user_id", authorId)
    .maybeSingle();

  const nextCount = (profileRow?.community_flag_count ?? 0) + 1;
  await admin.from("profiles").update({ community_flag_count: nextCount }).eq("user_id", authorId);

  const reasonLabel = FLAG_CATEGORY_LABELS[category as FlagCategory];
  const notifMessage = `Your ${contentLabel(contentType)} was flagged (${reasonLabel}) and is temporarily hidden pending review.`;

  await admin.from("notifications").insert([
    {
      user_id: authorId,
      actor_id: user.id,
      actor_name: "Community",
      type: "activity",
      message: notifMessage,
      post_owner_id: null,
    },
  ]);

  const { data: admins } = await admin.from("profiles").select("user_id").eq("is_admin", true);
  const { data: reporterProfile } = await admin
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const reporterName =
    reporterProfile?.display_name ||
    `${reporterProfile?.first_name || ""} ${reporterProfile?.last_name || ""}`.trim() ||
    "A member";

  if (admins && admins.length > 0) {
    await admin.from("notifications").insert(
      admins.map((a: { user_id: string }) => ({
        user_id: a.user_id,
        actor_id: user.id,
        actor_name: reporterName,
        type: "activity",
        message: `${contentType} flagged (${reasonLabel}) — ID ${contentId.slice(0, 8)}…`,
        post_owner_id: null,
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
