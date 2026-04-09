import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/notify
 * Creates an in-app notification for another user.
 * Uses the service role key so it bypasses RLS (client-side inserts for
 * other users are blocked by the notifications table RLS policy).
 * The actor_id is always derived from the caller's JWT — never trusted from body.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
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

  const { error } = await db.from("notifications").insert({
    user_id: body.user_id,
    actor_id: user.id,
    actor_name: body.actor_name ?? null,
    type: body.type ?? "feed_activity",
    message: body.message,
    post_owner_id: body.post_owner_id ?? null,
    post_id: body.post_id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
