import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSignupProfileComplete, resolveSignupNames, authMetadataDisplayName, splitFullName } from "@/app/lib/profileCompleteness";
import { referrerDisplayName } from "@/app/lib/referralReferrer";

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

  const profileSelectWithMirrors =
    "user_id, first_name, last_name, display_name, name, email, photo_url, role, service, status, skill_badge, years_experience, company_name, account_type, is_pure_admin, verification_status, email_verified, is_admin, is_employer, employer_verified, created_at, community_flag_count, referred_by, referrer_user_id";
  const profileSelectBase =
    "user_id, first_name, last_name, display_name, photo_url, role, service, status, skill_badge, years_experience, company_name, account_type, is_pure_admin, verification_status, email_verified, is_admin, is_employer, employer_verified, created_at, community_flag_count, referred_by, referrer_user_id";

  // Fetch profiles and auth users. The mirrored name/email columns are deployed via
  // migration, so keep this compatible with environments that have not run it yet.
  const [profilesRes, authUsersRes] = await Promise.all([
    adminClient
      .from("profiles")
      .select(profileSelectWithMirrors)
      .order("created_at", { ascending: false }),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  let profilesQuery = profilesRes as ProfilesQueryResult;
  if (profilesQuery.error) {
    profilesQuery = (await adminClient
      .from("profiles")
      .select(profileSelectBase)
      .order("created_at", { ascending: false })) as ProfilesQueryResult;
  }

  if (profilesQuery.error) {
    return NextResponse.json({ error: profilesQuery.error.message }, { status: 500 });
  }

  const profileRows = profilesQuery.data ?? [];
  const referrerIds = [
    ...new Set(
      profileRows
        .map((p) => (typeof p.referrer_user_id === "string" ? p.referrer_user_id : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const unresolvedCodes = [
    ...new Set(
      profileRows
        .filter((p) => !p.referrer_user_id && typeof p.referred_by === "string" && p.referred_by.trim())
        .map((p) => String(p.referred_by).trim().toUpperCase()),
    ),
  ];

  const referrerNameByUserId = new Map<string, string>();
  const referrerNameByCode = new Map<string, string>();

  if (referrerIds.length > 0) {
    const { data: referrersById } = await adminClient
      .from("profiles")
      .select("user_id, display_name, first_name, last_name")
      .in("user_id", referrerIds);
    for (const referrer of referrersById ?? []) {
      referrerNameByUserId.set(referrer.user_id, referrerDisplayName(referrer));
    }
  }

  if (unresolvedCodes.length > 0) {
    const { data: referrersByCode } = await adminClient
      .from("profiles")
      .select("referral_code, display_name, first_name, last_name")
      .in("referral_code", unresolvedCodes);
    for (const referrer of referrersByCode ?? []) {
      const code = referrer.referral_code?.trim().toUpperCase();
      if (code) referrerNameByCode.set(code, referrerDisplayName(referrer));
    }
  }

  // Build a map of auth user metadata by user_id
  const authUserMap = new Map<string, { email: string; full_name: string | null }>();
  for (const authUser of authUsersRes.data?.users ?? []) {
    authUserMap.set(authUser.id, {
      email: authUser.email ?? "",
      full_name: authMetadataDisplayName(authUser.user_metadata ?? null),
    });
  }

  // Merge profiles with auth users that have no profile row (incomplete signups).
  const profileUserIds = new Set(
    (profilesQuery.data ?? []).map((p) => String((p as { user_id: string }).user_id)),
  );
  const incompleteSignups = (authUsersRes.data?.users ?? [])
    .filter((authUser) => !profileUserIds.has(authUser.id))
    .map((authUser) => ({
      user_id: authUser.id,
      first_name: null,
      last_name: null,
      display_name: null,
      name: authMetadataDisplayName(authUser.user_metadata ?? null),
      email: authUser.email ?? null,
      photo_url: null,
      role: null,
      service: null,
      status: null,
      skill_badge: null,
      years_experience: null,
      verification_status: null,
      email_verified: false,
      is_admin: false,
      is_employer: false,
      employer_verified: false,
      created_at: authUser.created_at ?? null,
      community_flag_count: 0,
      signup_incomplete: true,
    }));

  // Merge: supplement missing profile names from auth metadata
  const profiles = [
    ...incompleteSignups,
    ...(profilesQuery.data ?? []).map((p) => {
    const authMeta = authUserMap.get(String(p.user_id));
    const row = p as Record<string, unknown> & { email?: string | null; name?: string | null };
    const dbFirst = typeof p.first_name === "string" ? p.first_name : null;
    const dbLast = typeof p.last_name === "string" ? p.last_name : null;
    const dbName = typeof row.name === "string" ? row.name : null;
    const dbDisplay = typeof p.display_name === "string" ? p.display_name : null;

    let first_name = dbFirst;
    let last_name = dbLast;

    if (!first_name && authMeta?.full_name) {
      const parts = splitFullName(authMeta.full_name);
      first_name = parts.first_name || null;
      last_name = last_name || parts.last_name || null;
    }

    const resolved = resolveSignupNames({
      first_name,
      last_name,
      name: dbName ?? authMeta?.full_name ?? null,
      display_name: dbDisplay,
    });
    first_name = resolved.first_name || null;
    last_name = resolved.last_name || null;

    const signupFields = {
      first_name,
      last_name,
      name: dbName ?? authMeta?.full_name ?? null,
      display_name: dbDisplay,
      service: typeof p.service === "string" ? p.service : null,
      company_name: typeof row.company_name === "string" ? row.company_name : null,
      account_type: typeof row.account_type === "string" ? row.account_type : null,
      is_pure_admin: row.is_pure_admin === true,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    };

    return {
      ...p,
      first_name,
      last_name,
      email: row.email ?? authMeta?.email ?? null,
      name: row.name ?? authMeta?.full_name ?? null,
      referred_by_name:
        (typeof row.referrer_user_id === "string"
          ? referrerNameByUserId.get(row.referrer_user_id)
          : null) ??
        (typeof row.referred_by === "string"
          ? referrerNameByCode.get(row.referred_by.trim().toUpperCase())
          : null) ??
        null,
      signup_incomplete: !isSignupProfileComplete(signupFields),
    };
  }),
  ];

  return NextResponse.json({ users: profiles });
}
