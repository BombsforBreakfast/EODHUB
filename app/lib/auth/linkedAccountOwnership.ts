import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when `a` and `b` are linked as personal owner ↔ business login
 * on a business_organization_pages row.
 */
export async function areAccountsOwnershipLinked(
  admin: SupabaseClient,
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;

  const { data: asOwner } = await admin
    .from("business_organization_pages")
    .select("id")
    .eq("owner_user_id", userIdA)
    .eq("business_auth_user_id", userIdB)
    .limit(1)
    .maybeSingle();
  if (asOwner?.id) return true;

  const { data: asBusiness } = await admin
    .from("business_organization_pages")
    .select("id")
    .eq("owner_user_id", userIdB)
    .eq("business_auth_user_id", userIdA)
    .limit(1)
    .maybeSingle();
  return !!asBusiness?.id;
}

export type OwnershipLinkedPage = {
  id: string;
  owner_user_id: string;
  business_auth_user_id: string;
  business_name: string;
  logo_url: string | null;
  is_active: boolean;
};

/** Pages the current user can switch into (as owner → biz login, or biz → owner). */
export async function listOwnershipLinkedPages(
  admin: SupabaseClient,
  currentUserId: string,
): Promise<OwnershipLinkedPage[]> {
  const { data: owned, error: ownedErr } = await admin
    .from("business_organization_pages")
    .select("id, owner_user_id, business_auth_user_id, business_name, logo_url, is_active")
    .eq("owner_user_id", currentUserId)
    .not("business_auth_user_id", "is", null);

  if (ownedErr) {
    console.error("[linkedAccountOwnership] owned pages", ownedErr);
  }

  const { data: asBiz, error: bizErr } = await admin
    .from("business_organization_pages")
    .select("id, owner_user_id, business_auth_user_id, business_name, logo_url, is_active")
    .eq("business_auth_user_id", currentUserId);

  if (bizErr) {
    console.error("[linkedAccountOwnership] business pages", bizErr);
  }

  const rows = [...(owned ?? []), ...(asBiz ?? [])] as Array<{
    id: string;
    owner_user_id: string;
    business_auth_user_id: string | null;
    business_name: string;
    logo_url: string | null;
    is_active: boolean | null;
  }>;

  const byId = new Map<string, OwnershipLinkedPage>();
  for (const row of rows) {
    if (!row.business_auth_user_id) continue;
    if (row.is_active === false) continue;
    byId.set(row.id, {
      id: row.id,
      owner_user_id: row.owner_user_id,
      business_auth_user_id: row.business_auth_user_id,
      business_name: row.business_name,
      logo_url: row.logo_url,
      // Inactive rows were filtered above; null/true both count as active.
      is_active: true,
    });
  }
  return [...byId.values()];
}
