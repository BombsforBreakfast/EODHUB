import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { syncBusinessOrgShopifyProducts } from "@/app/lib/businessOrgShopifySync";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

async function getRequestUser(req: NextRequest) {
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

function canManagePage(page: BusinessOrgPageRow, userId: string | null): boolean {
  return !!userId && (page.owner_user_id === userId || page.business_auth_user_id === userId);
}

export async function POST(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const pageId = typeof source.business_org_page_id === "string" ? source.business_org_page_id.trim() : "";
  const limit = typeof source.limit === "number" ? source.limit : undefined;

  if (!pageId) return NextResponse.json({ error: "Business page id is required." }, { status: 400 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data: pageData, error: pageError } = await client
    .from("business_organization_pages")
    .select("id, owner_user_id, business_auth_user_id, shopify_store_domain, shopify_admin_access_token")
    .eq("id", pageId)
    .maybeSingle();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const page = pageData as Pick<
    BusinessOrgPageRow,
    "id" | "owner_user_id" | "business_auth_user_id" | "shopify_store_domain" | "shopify_admin_access_token"
  > | null;
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });
  if (!canManagePage(page as BusinessOrgPageRow, requestUser.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncBusinessOrgShopifyProducts(client, page, { limit });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify sync failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
