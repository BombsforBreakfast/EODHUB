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

const ROLE_ORDER: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = getAdminClient();
  const { slug } = await params;

  const { data: unit, error: unitError } = await adminClient
    .from("units")
    .select("*")
    .eq("slug", slug)
    .single();

  if (unitError || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { data: currentMembership } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!currentMembership || currentMembership.status !== "approved") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: memberRows, error: membersError } = await adminClient
    .from("unit_members")
    .select("user_id, role, created_at")
    .eq("unit_id", unit.id)
    .eq("status", "approved");

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const members = memberRows ?? [];

  if (members.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const memberUserIds = members.map((m: { user_id: string }) => m.user_id);

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, photo_url, service, role as job_title")
    .in("user_id", memberUserIds);

  const profileMap: Record<string, {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    photo_url: string | null;
    service: string | null;
    job_title: string | null;
  }> = {};

  for (const p of profiles ?? []) {
    profileMap[p.user_id] = p;
  }

  const enriched = members
    .map((m: { user_id: string; role: string; created_at: string }) => {
      const profile = profileMap[m.user_id];
      const displayName =
        profile?.display_name ||
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
        "Unknown";
      return {
        user_id: m.user_id,
        unit_role: m.role,
        joined_at: m.created_at,
        display_name: displayName,
        photo_url: profile?.photo_url ?? null,
        service: profile?.service ?? null,
        job_title: profile?.job_title ?? null,
      };
    })
    .sort(
      (
        a: { unit_role: string; joined_at: string },
        b: { unit_role: string; joined_at: string }
      ) => {
        const roleA = ROLE_ORDER[a.unit_role] ?? 99;
        const roleB = ROLE_ORDER[b.unit_role] ?? 99;
        if (roleA !== roleB) return roleA - roleB;
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
      }
    );

  return NextResponse.json({ members: enriched });
}
