import { NextRequest, NextResponse } from "next/server";
import { authenticateRouteHandler } from "@/app/lib/server/createRouteHandlerClient";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { createNotification } from "@/app/lib/notificationsServer";
import type { BlockedUserSummary } from "@/app/lib/userBlocks";

type BlockRow = {
  id: string;
  blocked_id: string;
  reason: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

function displayName(profile: ProfileRow | undefined): string {
  return (
    profile?.display_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    "EOD-HUB user"
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRouteHandler(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client: adminClient, error: envError } = createSupabaseServiceRoleClient();
  if (envError || !adminClient) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const { data: blocks, error } = await adminClient
    .from("user_blocks")
    .select("id, blocked_id, reason, created_at")
    .eq("blocker_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const blockRows = (blocks ?? []) as BlockRow[];
  const blockedIds = blockRows.map((row) => row.blocked_id);
  const profilesById = new Map<string, ProfileRow>();

  if (blockedIds.length > 0) {
    const { data: profiles, error: profileError } = await adminClient
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, photo_url")
      .in("user_id", blockedIds);

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    for (const profile of (profiles ?? []) as ProfileRow[]) {
      profilesById.set(profile.user_id, profile);
    }
  }

  const response: BlockedUserSummary[] = blockRows.map((row) => {
    const profile = profilesById.get(row.blocked_id);
    return {
      id: row.id,
      blockedId: row.blocked_id,
      reason: row.reason,
      createdAt: row.created_at,
      displayName: displayName(profile),
      photoUrl: profile?.photo_url ?? null,
    };
  });

  return NextResponse.json({ blockedUsers: response });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRouteHandler(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { blockedId?: unknown; reason?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const blockedId = typeof body.blockedId === "string" ? body.blockedId.trim() : "";
  if (!isUuid(blockedId)) {
    return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  }
  if (blockedId === auth.user.id) {
    return NextResponse.json({ error: "You cannot hide/block yourself." }, { status: 400 });
  }

  const { client: adminClient, error: envError } = createSupabaseServiceRoleClient();
  if (envError || !adminClient) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  const context =
    typeof body.context === "string" && body.context.trim()
      ? body.context.trim().slice(0, 40).toLowerCase()
      : null;

  const { error } = await adminClient
    .from("user_blocks")
    .upsert(
      {
        blocker_id: auth.user.id,
        blocked_id: blockedId,
        reason,
      },
      { onConflict: "blocker_id,blocked_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Admin alert (same pattern as content flags)
  try {
    const [{ data: profiles }, { data: admins }] = await Promise.all([
      adminClient
        .from("profiles")
        .select("user_id, display_name, first_name, last_name")
        .in("user_id", [auth.user.id, blockedId]),
      adminClient.from("profiles").select("user_id").eq("is_admin", true),
    ]);

    const byId = new Map<string, ProfileRow>();
    for (const p of (profiles ?? []) as ProfileRow[]) byId.set(p.user_id, p);
    const blockerName = displayName(byId.get(auth.user.id));
    const blockedName = displayName(byId.get(blockedId));
    const where =
      context === "chatroom"
        ? " in Team Room"
        : context === "feed"
          ? " on the feed"
          : context
            ? ` (${context})`
            : "";
    const message = `${blockerName} blocked ${blockedName}${where}`;

    if (admins && admins.length > 0) {
      await Promise.all(
        admins.map((a: { user_id: string }) =>
          createNotification(adminClient, {
            recipientUserId: a.user_id,
            actorUserId: auth.user.id,
            actorName: blockerName,
            type: "activity",
            category: "system",
            entityType: "user_block",
            entityId: blockedId,
            message,
            title: "Member block",
            body: message,
            link: "/admin",
            groupKey: `admin:blocks:${auth.user.id}:${blockedId}`,
            dedupeKey: `admin_block:${auth.user.id}:${blockedId}:${a.user_id}`,
            metadata: {
              blocker_id: auth.user.id,
              blocked_id: blockedId,
              context,
              reason,
            },
          }),
        ),
      );
    }
  } catch (notifyErr) {
    console.error("[user-blocks] admin notify failed", notifyErr);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRouteHandler(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blockedId = request.nextUrl.searchParams.get("blockedId")?.trim() ?? "";
  if (!isUuid(blockedId)) {
    return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  }

  const { client: adminClient, error: envError } = createSupabaseServiceRoleClient();
  if (envError || !adminClient) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const { error } = await adminClient
    .from("user_blocks")
    .delete()
    .eq("blocker_id", auth.user.id)
    .eq("blocked_id", blockedId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
