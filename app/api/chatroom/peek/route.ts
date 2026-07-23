import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CHATROOM_ROOM_ID, type ChatroomPeekLatest } from "../../../lib/chatroom";
import { mentionsToDisplayText } from "../../../lib/mentions";
import { fetchBlockedUserIds } from "../../../lib/userBlocks";
import { hasFullPlatformAccess, type VerificationProfile } from "../../../lib/verificationAccess";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;
  return { user, userClient, token };
}

function authorName(p: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | undefined): string {
  return (
    p?.display_name?.trim() ||
    `${p?.first_name || ""} ${p?.last_name || ""}`.trim() ||
    "Member"
  );
}

/** Lightweight latest-line + unread count for the global Team Room peek bar. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at",
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sinceRaw = req.nextUrl.searchParams.get("since");
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
  const sinceIso = Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : null;

  const blocked = await fetchBlockedUserIds(admin, auth.user.id);
  const nowIso = new Date().toISOString();

  const { data: recentRows, error } = await admin
    .from("chatroom_messages")
    .select("id, user_id, body, gif_url, created_at")
    .eq("room_id", CHATROOM_ROOM_ID)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const visible = (recentRows ?? []).filter((row) => !blocked.has(row.user_id));
  const newest = visible[0] ?? null;

  let latest: ChatroomPeekLatest | null = null;
  if (newest) {
    const { data: author } = await admin
      .from("profiles")
      .select("display_name, first_name, last_name")
      .eq("user_id", newest.user_id)
      .maybeSingle();

    latest = {
      id: newest.id,
      user_id: newest.user_id,
      author_name: authorName(author ?? undefined),
      body: newest.body?.trim()
        ? mentionsToDisplayText(newest.body)
        : newest.gif_url
          ? "[GIF]"
          : "",
      gif_url: newest.gif_url ?? null,
      created_at: newest.created_at,
    };
  }

  const unread_count = !sinceIso
    ? 0
    : visible.filter((row) => {
        if (row.user_id === auth.user.id) return false;
        return row.created_at > sinceIso;
      }).length;

  return NextResponse.json({ latest, unread_count });
}
