import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  // Verify caller is admin
  const authHeader = req.headers.get("authorization");
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

  // Fetch all profiles and all auth users in parallel
  const [profilesRes, authUsersRes] = await Promise.all([
    adminClient
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, role, service, verification_status, is_admin, created_at")
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

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
    const authMeta = authUserMap.get(p.user_id);
    let first_name = p.first_name;
    let last_name = p.last_name;

    if (!first_name && authMeta?.full_name) {
      const parts = authMeta.full_name.trim().split(/\s+/);
      first_name = parts[0] || null;
      last_name = parts.slice(1).join(" ") || null;
    }

    return { ...p, first_name, last_name, email: authMeta?.email ?? null };
  });

  return NextResponse.json({ users: profiles });
}
