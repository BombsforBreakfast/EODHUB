import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProfilesQueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export async function GET(req: NextRequest) {
  // Verify caller is admin
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const profileSelectWithMirrorsAndTier =
    "user_id, first_name, last_name, display_name, name, email, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, community_flag_count, access_tier";
  const profileSelectWithMirrors =
    "user_id, first_name, last_name, display_name, name, email, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, community_flag_count";
  const profileSelectWithTier =
    "user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, community_flag_count, access_tier";
  const profileSelectBase =
    "user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, is_employer, employer_verified, created_at, community_flag_count";

  // Fetch profiles and auth users. The mirrored name/email columns are deployed via
  // migration, so keep this compatible with environments that have not run it yet.
  const [profilesWithTierRes, authUsersRes] = await Promise.all([
    adminClient
      .from("profiles")
      .select(profileSelectWithMirrorsAndTier)
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  let profilesRes = profilesWithTierRes as ProfilesQueryResult;
  if (profilesRes.error) {
    profilesRes = (await adminClient
      .from("profiles")
      .select(profileSelectWithMirrors)
      .order("created_at", { ascending: false })) as ProfilesQueryResult;
  }
  if (profilesRes.error) {
    profilesRes = (await adminClient
      .from("profiles")
      .select(profileSelectWithTier)
      .order("created_at", { ascending: false })) as ProfilesQueryResult;
  }
  if (profilesRes.error) {
    profilesRes = (await adminClient
      .from("profiles")
      .select(profileSelectBase)
      .order("created_at", { ascending: false })) as ProfilesQueryResult;
  }

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  // Build a map of auth user metadata by user_id
  const authUserMap = new Map<string, { email: string; full_name: string | null }>();
  for (const authUser of authUsersRes.data?.users ?? []) {
    authUserMap.set(authUser.id, {
      email: authUser.email ?? "",
      full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
    });
  }

  // Merge: supplement missing profile names from auth metadata
  const profiles = (profilesRes.data ?? []).map((p) => {
    const authMeta = authUserMap.get(String(p.user_id));
    const row = p as Record<string, unknown> & { email?: string | null; name?: string | null };
    let first_name = typeof p.first_name === "string" ? p.first_name : null;
    let last_name = typeof p.last_name === "string" ? p.last_name : null;

    if (!first_name && authMeta?.full_name) {
      const parts = authMeta.full_name.trim().split(/\s+/);
      first_name = parts[0] || null;
      last_name = parts.slice(1).join(" ") || null;
    }

    return {
      ...p,
      first_name,
      last_name,
      email: row.email ?? authMeta?.email ?? null,
      name: row.name ?? authMeta?.full_name ?? null,
    };
  });

  return NextResponse.json({ users: profiles });
}
