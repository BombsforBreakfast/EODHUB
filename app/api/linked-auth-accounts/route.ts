import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import {
  collectIdentityProviders,
  createSupabaseServiceRoleClient,
} from "../../lib/auth/adminAuthLookup";
import { buildLinkedAccountSummary, type LinkedAccountSummary, type ProfileRow } from "../../lib/auth/linkedAccountLabels";
import { listOwnershipLinkedPages } from "../../lib/auth/linkedAccountOwnership";

export async function GET(req: NextRequest) {
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
  if (!user) {
    return NextResponse.json({ accounts: [], sameEmailCount: 0, canSwitch: false });
  }

  const { client, error } = createSupabaseServiceRoleClient();
  if (error === "missing_env") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const admin = client!;

  const accountsById = new Map<string, LinkedAccountSummary>();
  const authById = new Map<string, User>();
  const profileIds = new Set<string>([user.id]);
  const sameEmailIds = new Set<string>();

  // Same-email duplicates via profiles.email (avoids full auth.users scan)
  const normalized = user.email?.toLowerCase() ?? "";
  if (normalized) {
    const { data: sameEmailRows } = await admin
      .from("profiles")
      .select("user_id")
      .ilike("email", normalized);
    for (const row of sameEmailRows ?? []) {
      if (typeof row.user_id === "string") {
        profileIds.add(row.user_id);
        sameEmailIds.add(row.user_id);
      }
    }
  }
  const sameEmailCount = sameEmailIds.size;

  async function ensureAuthUser(id: string): Promise<User | null> {
    const cached = authById.get(id);
    if (cached) return cached;
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user) {
      authById.set(id, data.user);
      return data.user;
    }
    return null;
  }

  await ensureAuthUser(user.id);

  // Ownership-linked business ↔ personal
  const ownershipPages = await listOwnershipLinkedPages(admin, user.id);
  const ownershipTargetMeta = new Map<
    string,
    { businessName: string; logoUrl: string | null; isBusinessTarget: boolean }
  >();
  for (const page of ownershipPages) {
    const targetId =
      page.owner_user_id === user.id ? page.business_auth_user_id : page.owner_user_id;
    if (!targetId || targetId === user.id) continue;
    profileIds.add(targetId);
    ownershipTargetMeta.set(targetId, {
      businessName: page.business_name,
      logoUrl: page.logo_url,
      isBusinessTarget: page.owner_user_id === user.id,
    });
  }

  const ids = [...profileIds];
  await Promise.all(ids.map((id) => ensureAuthUser(id)));

  const { data: profileRows, error: profErr } = await admin
    .from("profiles")
    .select(
      "user_id, first_name, last_name, account_type, is_employer, company_name, service, verification_status, photo_url"
    )
    .in("user_id", ids);

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 503 });
  }

  const profileById = new Map<string, ProfileRow>();
  for (const row of (profileRows ?? []) as ProfileRow[]) {
    profileById.set(row.user_id, row);
  }

  // Current account first
  const currentAuth = authById.get(user.id) ?? user;
  accountsById.set(
    user.id,
    buildLinkedAccountSummary(
      currentAuth,
      profileById.get(user.id),
      true,
      collectIdentityProviders(currentAuth),
      { linkSource: "current" },
    ),
  );

  // Same-email peers
  for (const peerId of sameEmailIds) {
    if (peerId === user.id) continue;
    if (ownershipTargetMeta.has(peerId)) continue;
    const authUser = authById.get(peerId);
    if (!authUser) continue;
    accountsById.set(
      peerId,
      buildLinkedAccountSummary(
        authUser,
        profileById.get(peerId),
        false,
        collectIdentityProviders(authUser),
        { linkSource: "same_email" },
      ),
    );
  }

  // Ownership-linked targets
  for (const [targetId, meta] of ownershipTargetMeta) {
    const authUser = authById.get(targetId);
    if (!authUser) continue;
    const profile = profileById.get(targetId);
    accountsById.set(
      targetId,
      buildLinkedAccountSummary(
        authUser,
        profile,
        false,
        collectIdentityProviders(authUser),
        {
          linkSource: "business_ownership",
          forceBusiness: meta.isBusinessTarget,
          businessName: meta.isBusinessTarget ? meta.businessName : null,
          photoUrlOverride: meta.isBusinessTarget
            ? meta.logoUrl ?? profile?.photo_url ?? null
            : profile?.photo_url ?? null,
        },
      ),
    );
  }

  const accounts = [...accountsById.values()];
  accounts.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    if (a.kind === "business" && b.kind !== "business") return -1;
    if (b.kind === "business" && a.kind !== "business") return 1;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json({
    accounts,
    sameEmailCount,
    ownershipLinkedCount: ownershipTargetMeta.size,
    canSwitch: accounts.some((a) => !a.isCurrent),
  });
}
