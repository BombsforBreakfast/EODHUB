import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  blocksSignupApproval,
  isSignupProfileComplete,
  resolveSignupNames,
  authMetadataDisplayName,
  splitFullName,
} from "@/app/lib/profileCompleteness";
import { referrerDisplayName } from "@/app/lib/referralReferrer";

type ProfilesQueryResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
  count?: number | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FULL_LIST_LIMIT = 5000;
const PENDING_REVIEW_STATUSES = ["awaiting_admin_review", "pending_admin_review", "pending"];
const PROFILE_SELECT_WITH_MIRRORS =
  "user_id, first_name, last_name, display_name, name, email, photo_url, role, service, status, skill_badge, years_experience, company_name, account_type, is_pure_admin, verification_status, email_verified, is_admin, is_employer, employer_verified, created_at, community_flag_count, referred_by, referrer_user_id";
const PROFILE_SELECT_BASE =
  "user_id, first_name, last_name, display_name, photo_url, role, service, status, skill_badge, years_experience, company_name, account_type, is_pure_admin, verification_status, email_verified, is_admin, is_employer, employer_verified, created_at, community_flag_count, referred_by, referrer_user_id";

type UserStatusFilter = "all" | "pending" | "onboarding" | "verified" | "unverified" | "denied";

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseStatusFilter(value: string | null): UserStatusFilter {
  if (
    value === "pending" ||
    value === "onboarding" ||
    value === "verified" ||
    value === "unverified" ||
    value === "denied"
  ) {
    return value;
  }
  return "all";
}

function escapeIlike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`).replace(/,/g, " ");
}

function applyProfileStatusFilter<T extends { eq: (column: string, value: unknown) => T; neq: (column: string, value: unknown) => T; in: (column: string, values: string[]) => T; or: (filters: string) => T }>(
  query: T,
  status: UserStatusFilter,
) {
  if (status === "verified") return query.eq("verification_status", "verified");
  if (status === "denied") return query.eq("verification_status", "denied");
  if (status === "pending") {
    return query.eq("email_verified", true).in("verification_status", PENDING_REVIEW_STATUSES);
  }
  if (status === "unverified") {
    return query.or("verification_status.is.null,and(verification_status.neq.verified,verification_status.neq.denied)");
  }
  if (status === "onboarding") {
    return query.or("verification_status.is.null,and(verification_status.neq.verified,verification_status.neq.denied)");
  }
  return query;
}

function applyProfileSearch<T extends { or: (filters: string) => T }>(
  query: T,
  rawSearch: string,
  includeMirroredColumns: boolean,
) {
  const q = escapeIlike(rawSearch.trim());
  if (!q) return query;
  const pattern = `%${q}%`;
  const fields = [
    "first_name",
    "last_name",
    "display_name",
    "service",
    "role",
    "company_name",
    "user_id",
  ];
  if (includeMirroredColumns) fields.splice(3, 0, "name", "email");
  return query.or(fields.map((field) => `${field}.ilike.${pattern}`).join(","));
}

function isAtAdminReviewTier(row: Record<string, unknown>) {
  return (
    row.email_verified === true &&
    isSignupProfileComplete(row) &&
    PENDING_REVIEW_STATUSES.includes(String(row.verification_status ?? ""))
  );
}

function isReadyForAdminVerify(row: Record<string, unknown>) {
  if (row.verification_status === "verified") return false;
  return !blocksSignupApproval({
    first_name: typeof row.first_name === "string" ? row.first_name : null,
    last_name: typeof row.last_name === "string" ? row.last_name : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    is_pure_admin: row.is_pure_admin === true,
  });
}

function userMatchesStatus(row: Record<string, unknown>, status: UserStatusFilter) {
  if (status === "all") return true;
  if (status === "verified") return row.verification_status === "verified";
  if (status === "denied") return row.verification_status === "denied";
  if (status === "pending") return isAtAdminReviewTier(row);
  if (status === "onboarding") {
    if (row.verification_status === "verified" || row.verification_status === "denied") return false;
    return row.signup_incomplete === true || !isSignupProfileComplete(row);
  }
  if (status === "unverified") return isReadyForAdminVerify(row);
  return true;
}

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

  const search = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const status = parseStatusFilter(req.nextUrl.searchParams.get("status"));
  const full = req.nextUrl.searchParams.get("full") === "true";
  const offset = full ? 0 : parseBoundedInt(req.nextUrl.searchParams.get("offset"), 0, 0, 100_000);
  const limit = full
    ? FULL_LIST_LIMIT
    : parseBoundedInt(req.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);

  let profileQuery = adminClient
    .from("profiles")
    .select(PROFILE_SELECT_WITH_MIRRORS, { count: "exact" })
    .order("created_at", { ascending: false });
  profileQuery = applyProfileStatusFilter(applyProfileSearch(profileQuery, search, true), status);
  if (!full) profileQuery = profileQuery.range(offset, offset + limit - 1);

  let profilesQuery = (await profileQuery) as ProfilesQueryResult;
  if (profilesQuery.error) {
    let fallbackQuery = adminClient
      .from("profiles")
      .select(PROFILE_SELECT_BASE, { count: "exact" })
      .order("created_at", { ascending: false });
    fallbackQuery = applyProfileStatusFilter(applyProfileSearch(fallbackQuery, search, false), status);
    if (!full) fallbackQuery = fallbackQuery.range(offset, offset + limit - 1);
    profilesQuery = (await fallbackQuery) as ProfilesQueryResult;
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

  // Build a map of auth user metadata by user_id. Normal paged loads only fetch
  // auth records for the visible profile IDs; full loads are intentionally heavier.
  const authUserMap = new Map<string, { email: string; full_name: string | null }>();
  const visibleProfileIds = profileRows
    .filter((p) => {
      const row = p as Record<string, unknown>;
      const hasEmail = typeof row.email === "string" && row.email.trim().length > 0;
      const hasName =
        (typeof row.name === "string" && row.name.trim().length > 0) ||
        (typeof row.display_name === "string" && row.display_name.trim().length > 0) ||
        (typeof row.first_name === "string" && row.first_name.trim().length > 0);
      return !hasEmail || !hasName;
    })
    .map((p) => (typeof p.user_id === "string" ? p.user_id : null))
    .filter((id): id is string => !!id);

  if (full) {
    let page = 1;
    for (;;) {
      const authUsersRes = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      for (const authUser of authUsersRes.data?.users ?? []) {
        authUserMap.set(authUser.id, {
          email: authUser.email ?? "",
          full_name: authMetadataDisplayName(authUser.user_metadata ?? null),
        });
      }
      if ((authUsersRes.data?.users ?? []).length < 1000 || authUserMap.size >= FULL_LIST_LIMIT) break;
      page += 1;
    }
  } else {
    await Promise.all(
      visibleProfileIds.map(async (id) => {
        const { data } = await adminClient.auth.admin.getUserById(id);
        if (data?.user) {
          authUserMap.set(id, {
            email: data.user.email ?? "",
            full_name: authMetadataDisplayName(data.user.user_metadata ?? null),
          });
        }
      }),
    );
  }

  // Merge profiles with auth users that have no profile row (incomplete signups).
  const profileUserIds = new Set(
    (profilesQuery.data ?? []).map((p) => String((p as { user_id: string }).user_id)),
  );
  const authUsersForIncomplete = full
    ? [...authUserMap.entries()].map(([id, meta]) => ({
        id,
        email: meta.email,
        created_at: null,
        user_metadata: { full_name: meta.full_name },
      }))
    : [];
  const incompleteSignups = authUsersForIncomplete
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
  ].filter((row) => userMatchesStatus(row as Record<string, unknown>, status));

  return NextResponse.json({
    users: full ? profiles.slice(0, FULL_LIST_LIMIT) : profiles,
    totalCount: full ? profiles.length : (profilesQuery.count ?? profiles.length),
    full,
  });
}
