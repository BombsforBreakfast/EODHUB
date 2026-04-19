import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FLAG_CATEGORY_LABELS, type FlagCategory, isFlagCategory } from "../../lib/flagCategories";
import { createNotification } from "../../lib/notificationsServer";

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

type FlaggableContentType =
  | "post"
  | "comment"
  | "message"
  | "rabbithole_contribution"
  | "rabbithole_contribution_comment"
  | "rabbithole_thread"
  | "rabbithole_reply";

const FLAGGABLE_CONTENT_TYPES: FlaggableContentType[] = [
  "post",
  "comment",
  "message",
  "rabbithole_contribution",
  "rabbithole_contribution_comment",
  "rabbithole_thread",
  "rabbithole_reply",
];

function isFlaggableContentType(v: string): v is FlaggableContentType {
  return (FLAGGABLE_CONTENT_TYPES as string[]).includes(v);
}

function contentLabel(contentType: FlaggableContentType): string {
  switch (contentType) {
    case "post":
      return "post";
    case "comment":
      return "comment";
    case "message":
      return "message";
    case "rabbithole_contribution":
      return "RabbitHole contribution";
    case "rabbithole_contribution_comment":
      return "RabbitHole comment";
    case "rabbithole_thread":
      return "RabbitHole thread";
    case "rabbithole_reply":
      return "RabbitHole reply";
    default:
      return "content";
  }
}

type ContentLookup = {
  table: string;
  authorColumn: string;
  /** Some tables don't have a hidden_for_review column yet; skip the hide step if so. */
  hidable: boolean;
};

const CONTENT_LOOKUP: Record<FlaggableContentType, ContentLookup> = {
  post: { table: "posts", authorColumn: "user_id", hidable: true },
  comment: { table: "post_comments", authorColumn: "user_id", hidable: true },
  message: { table: "messages", authorColumn: "sender_id", hidable: true },
  rabbithole_contribution: {
    table: "rabbithole_contributions",
    authorColumn: "created_by",
    hidable: true,
  },
  rabbithole_contribution_comment: {
    table: "rabbithole_contribution_comments",
    authorColumn: "user_id",
    hidable: true,
  },
  rabbithole_thread: {
    table: "rabbithole_threads",
    authorColumn: "author_id",
    hidable: false,
  },
  rabbithole_reply: {
    table: "rabbithole_replies",
    authorColumn: "author_id",
    hidable: false,
  },
};

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
  if (typeof contentType !== "string" || !isFlaggableContentType(contentType)) {
    return NextResponse.json({ error: "Invalid contentType" }, { status: 400 });
  }
  if (!category || typeof category !== "string" || !isFlagCategory(category)) {
    return NextResponse.json({ error: "Invalid or missing category" }, { status: 400 });
  }

  const admin = getAdminClient();
  const lookup = CONTENT_LOOKUP[contentType];

  const { data: row, error: lookupErr } = await admin
    .from(lookup.table)
    .select(lookup.authorColumn)
    .eq("id", contentId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  const authorId =
    (row as Record<string, string | null> | null)?.[lookup.authorColumn] ?? null;

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

  if (lookup.hidable) {
    const { error: hideErr } = await admin
      .from(lookup.table)
      .update({ hidden_for_review: true })
      .eq("id", contentId);
    if (hideErr) {
      return NextResponse.json({ error: hideErr.message }, { status: 500 });
    }
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

  await createNotification(admin, {
    recipientUserId: authorId,
    actorUserId: user.id,
    actorName: "Community",
    type: "activity",
    category: "system",
    entityType: contentType,
    entityId: contentId,
    message: notifMessage,
    groupKey: `${contentType}:${contentId}:flags`,
    dedupeKey: `flag_notice:${contentType}:${contentId}:${authorId}`,
    metadata: { content_type: contentType, content_id: contentId, category },
  });

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
    await Promise.all(
      admins.map((a: { user_id: string }) =>
        createNotification(admin, {
          recipientUserId: a.user_id,
          actorUserId: user.id,
          actorName: reporterName,
          type: "activity",
          category: "system",
          entityType: contentType,
          entityId: contentId,
          message: `${contentType} flagged (${reasonLabel}) — ID ${contentId.slice(0, 8)}...`,
          link: "/admin",
          groupKey: `admin:flags:${contentType}:${contentId}`,
          dedupeKey: `admin_flag:${contentType}:${contentId}:${a.user_id}`,
          metadata: { content_type: contentType, content_id: contentId, category, reporter_id: user.id },
        }),
      ),
    );
  }

  return NextResponse.json({ ok: true });
}
