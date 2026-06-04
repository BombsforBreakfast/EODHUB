import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";

export async function getRequestUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await userClient.auth.getUser();
  return data.user ?? null;
}

export function canManageBusinessPage(page: BusinessOrgPageRow, userId: string | null): boolean {
  return !!userId && (page.owner_user_id === userId || page.business_auth_user_id === userId);
}

export async function getBusinessPageForUser(
  client: SupabaseClient,
  businessId: string,
): Promise<BusinessOrgPageRow | null> {
  const { data, error } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as BusinessOrgPageRow | null) ?? null;
}

export async function userCanManageBusiness(
  client: SupabaseClient,
  businessId: string,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await client
    .from("profiles")
    .select("is_admin, is_pure_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.is_admin || profile?.is_pure_admin) return true;

  const page = await getBusinessPageForUser(client, businessId);
  return !!page && canManageBusinessPage(page, userId);
}

export function getServiceClientOrThrow() {
  const { client, error } = createSupabaseServiceRoleClient();
  if (error || !client) throw new Error("Server configuration error");
  return client;
}

export function normalizeShopDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let trimmed = value.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!trimmed) return null;
  if (!trimmed.includes(".")) trimmed = `${trimmed}.myshopify.com`;
  return trimmed;
}
