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

async function assertAdmin(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 } as const;
  }

  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return { error: "Unauthorized", status: 401 } as const;
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { user } as const;
}

type UnitRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_url: string | null;
  type: string | null;
  created_by: string | null;
  created_at: string | null;
};

type ProfileMini = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email?: string | null;
};

function displayName(profile: ProfileMini | undefined) {
  if (!profile) return null;
  return (
    profile.display_name ||
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    profile.email ||
    null
  );
}

export async function GET(req: NextRequest) {
  const auth = await assertAdmin(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getAdminClient();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  let unitsQuery = db
    .from("units")
    .select("id, name, slug, description, cover_photo_url, type, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (q) {
    unitsQuery = unitsQuery.ilike("name", `%${q}%`);
  }

  const { data: units, error: unitsError } = await unitsQuery;
  if (unitsError) {
    return NextResponse.json({ error: unitsError.message }, { status: 500 });
  }

  const unitRows = (units ?? []) as UnitRow[];
  if (unitRows.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const unitIds = unitRows.map((u) => u.id);
  const ownerIds = [...new Set(unitRows.map((u) => u.created_by).filter(Boolean))] as string[];

  const [membersRes, postsRes, profilesRes] = await Promise.all([
    db
      .from("unit_members")
      .select("unit_id", { count: "exact" })
      .in("unit_id", unitIds)
      .eq("status", "approved"),
    db
      .from("unit_posts")
      .select("unit_id", { count: "exact" })
      .in("unit_id", unitIds),
    ownerIds.length > 0
      ? db
          .from("profiles")
          .select("user_id, first_name, last_name, display_name")
          .in("user_id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersRes.error) {
    return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  }
  if (postsRes.error) {
    return NextResponse.json({ error: postsRes.error.message }, { status: 500 });
  }
  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  const memberCounts: Record<string, number> = {};
  for (const row of (membersRes.data ?? []) as Array<{ unit_id: string }>) {
    memberCounts[row.unit_id] = (memberCounts[row.unit_id] ?? 0) + 1;
  }

  const postCounts: Record<string, number> = {};
  for (const row of (postsRes.data ?? []) as Array<{ unit_id: string }>) {
    postCounts[row.unit_id] = (postCounts[row.unit_id] ?? 0) + 1;
  }

  const profileMap: Record<string, ProfileMini> = {};
  for (const profile of (profilesRes.data ?? []) as ProfileMini[]) {
    profileMap[profile.user_id] = profile;
  }

  const groups = unitRows.map((unit) => {
    const owner = unit.created_by ? profileMap[unit.created_by] : undefined;
    return {
      ...unit,
      member_count: memberCounts[unit.id] ?? 0,
      post_count: postCounts[unit.id] ?? 0,
      owner_name: displayName(owner),
    };
  });

  return NextResponse.json({ groups });
}

export async function DELETE(req: NextRequest) {
  const auth = await assertAdmin(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const groupId = req.nextUrl.searchParams.get("id");
  if (!groupId) {
    return NextResponse.json({ error: "Missing group id" }, { status: 400 });
  }

  const db = getAdminClient();
  const { error } = await db.from("units").delete().eq("id", groupId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
