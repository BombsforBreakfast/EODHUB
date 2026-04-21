import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "../../lib/notificationsServer";

/**
 * POST /api/notify
 * Creates an in-app notification for another user.
 * Uses the service role key so it bypasses RLS (client-side inserts for
 * other users are blocked by the notifications table RLS policy).
 * The actor_id is always derived from the caller's JWT — never trusted from body.
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get("Authorization") ?? req.headers.get("authorization"))?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    user_id: string;
    message: string;
    post_owner_id?: string | null;
    type?: string | null;
    post_id?: string | null;
    actor_name?: string | null;
    category?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    parent_entity_type?: string | null;
    parent_entity_id?: string | null;
    link?: string | null;
    group_key?: string | null;
    dedupe_key?: string | null;
    metadata?: Record<string, unknown> | null;
  };

  if (!body.user_id || !body.message) {
    return NextResponse.json({ error: "user_id and message required" }, { status: 400 });
  }

  // Don't notify yourself
  if (body.user_id === user.id) {
    return NextResponse.json({ ok: true });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    await createNotification(db, {
      recipientUserId: body.user_id,
      actorUserId: user.id,
      actorName: body.actor_name ?? null,
      postOwnerId: body.post_owner_id ?? null,
      type: body.type ?? "feed_activity",
      category: body.category ?? "social",
      entityType: body.entity_type ?? (body.post_id ? "post" : null),
      entityId: body.entity_id ?? body.post_id ?? null,
      parentEntityType: body.parent_entity_type ?? null,
      parentEntityId: body.parent_entity_id ?? null,
      message: body.message,
      link: body.link ?? null,
      groupKey: body.group_key ?? null,
      dedupeKey: body.dedupe_key ?? null,
      metadata: body.metadata ?? {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
