import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectionStatus = "pending" | "accepted" | "denied";
type KnowStatus = "none" | "pending_outgoing" | "pending_incoming" | "accepted";

type ConnectionRow = {
  id: string;
  requester_user_id: string;
  target_user_id: string;
  status: ConnectionStatus;
  worked_with: boolean;
  requester_worked_with_target?: boolean | null;
  target_worked_with_requester?: boolean | null;
  updated_at: string | null;
};

type ProfileLite = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
};

function getOtherId(row: Pick<ConnectionRow, "requester_user_id" | "target_user_id">, userId: string): string {
  return row.requester_user_id === userId ? row.target_user_id : row.requester_user_id;
}

function viewerWorkedWith(row: ConnectionRow, viewerId: string): boolean {
  if (
    typeof row.requester_worked_with_target !== "boolean" ||
    typeof row.target_worked_with_requester !== "boolean"
  ) {
    return row.worked_with === true;
  }
  return row.requester_user_id === viewerId
    ? row.requester_worked_with_target === true
    : row.target_worked_with_requester === true;
}

function knowStatus(row: ConnectionRow | null, viewerId: string): KnowStatus {
  if (!row || row.status === "denied") return "none";
  if (row.status === "accepted") return "accepted";
  return row.requester_user_id === viewerId ? "pending_outgoing" : "pending_incoming";
}

function isMissingHandshakeColumnError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return message.includes("requester_worked_with_target")
    || message.includes("target_worked_with_requester");
}

async function loadAcceptedRows(admin: SupabaseClient, targetUserId: string) {
  const query = admin
    .from("profile_connections")
    .select(
      "id, requester_user_id, target_user_id, status, worked_with, requester_worked_with_target, target_worked_with_requester, updated_at",
    )
    .eq("status", "accepted")
    .or(`requester_user_id.eq.${targetUserId},target_user_id.eq.${targetUserId}`)
    .order("updated_at", { ascending: false });

  const result = await query;
  if (!result.error || !isMissingHandshakeColumnError(result.error)) return result;

  return admin
    .from("profile_connections")
    .select("id, requester_user_id, target_user_id, status, worked_with, updated_at")
    .eq("status", "accepted")
    .or(`requester_user_id.eq.${targetUserId},target_user_id.eq.${targetUserId}`)
    .order("updated_at", { ascending: false });
}

async function loadViewerRelation(admin: SupabaseClient, viewerId: string, targetUserId: string) {
  const result = await admin
    .from("profile_connections")
    .select(
      "id, requester_user_id, target_user_id, status, worked_with, requester_worked_with_target, target_worked_with_requester, updated_at",
    )
    .or(
      `and(requester_user_id.eq.${viewerId},target_user_id.eq.${targetUserId}),` +
      `and(requester_user_id.eq.${targetUserId},target_user_id.eq.${viewerId})`,
    )
    .maybeSingle();

  if (!result.error || !isMissingHandshakeColumnError(result.error)) return result;

  return admin
    .from("profile_connections")
    .select("id, requester_user_id, target_user_id, status, worked_with, updated_at")
    .or(
      `and(requester_user_id.eq.${viewerId},target_user_id.eq.${targetUserId}),` +
      `and(requester_user_id.eq.${targetUserId},target_user_id.eq.${viewerId})`,
    )
    .maybeSingle();
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get("Authorization") ?? req.headers.get("authorization"))?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const targetUserId = req.nextUrl.searchParams.get("targetUserId")?.trim();
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData } = await userClient.auth.getUser();
  const viewer = authData.user;
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: acceptedRows, error: acceptedError } = await loadAcceptedRows(admin, targetUserId);

  if (acceptedError) {
    return NextResponse.json({ error: acceptedError.message }, { status: 500 });
  }

  const rows = (acceptedRows ?? []) as ConnectionRow[];
  const otherIds = rows.map((row) => getOtherId(row, targetUserId));
  const uniqueIds = [...new Set(otherIds)];

  let profileMap = new Map<string, ProfileLite>();
  if (uniqueIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("user_id, first_name, last_name, photo_url, service")
      .in("user_id", uniqueIds);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    profileMap = new Map(((profiles ?? []) as ProfileLite[]).map((p) => [p.user_id, p]));
  }

  const connections = rows
    .map((row) => {
      const otherId = getOtherId(row, targetUserId);
      const profile = profileMap.get(otherId);
      if (!profile) return null;
      return {
        ...profile,
        worked_with: row.worked_with === true,
        viewer_worked_with: viewerWorkedWith(row, viewer.id),
      };
    })
    .filter((row): row is ProfileLite & { worked_with: boolean; viewer_worked_with: boolean } => row !== null);

  const { data: relation, error: relationError } = viewer.id === targetUserId
    ? { data: null }
    : await loadViewerRelation(admin, viewer.id, targetUserId);

  if (relationError) {
    return NextResponse.json({ error: relationError.message }, { status: 500 });
  }

  const rel = (relation as ConnectionRow | null) ?? null;

  return NextResponse.json({
    knowCount: rows.length,
    knownPreviewUsers: connections.slice(0, 6),
    connections,
    relation: rel
      ? {
        id: rel.id,
        status: rel.status,
        knowStatus: knowStatus(rel, viewer.id),
        workedWith: rel.worked_with === true,
        viewerWorkedWith: viewerWorkedWith(rel, viewer.id),
        requesterUserId: rel.requester_user_id,
        targetUserId: rel.target_user_id,
      }
      : null,
  });
}
