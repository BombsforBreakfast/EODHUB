import { NextRequest, NextResponse } from "next/server";
import { authenticateRouteHandler } from "@/app/lib/server/createRouteHandlerClient";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
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

  let body: { blockedId?: unknown; reason?: unknown };
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
