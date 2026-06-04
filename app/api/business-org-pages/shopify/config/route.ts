import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";
import { resolveShopifyCredentials } from "@/app/lib/shopify";

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

function normalizeStoreDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return trimmed || null;
}

export async function GET(req: NextRequest) {
  const pageId = req.nextUrl.searchParams.get("pageId")?.trim();
  if (!pageId) return NextResponse.json({ error: "Page id is required." }, { status: 400 });

  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data: pageData, error: pageError } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", pageId)
    .maybeSingle();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const page = (pageData as unknown as BusinessOrgPageRow | null) ?? null;
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });
  if (!canManagePage(page, requestUser.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credentials = resolveShopifyCredentials({
    pageStoreDomain: page.shopify_store_domain,
    pageAccessToken: page.shopify_admin_access_token,
    envStoreDomain: process.env.SHOPIFY_STORE_DOMAIN,
    envAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  });

  return NextResponse.json({
    connected: !!credentials,
    storeDomain: page.shopify_store_domain ?? process.env.SHOPIFY_STORE_DOMAIN ?? null,
    hasStoredToken: !!page.shopify_admin_access_token,
    usesEnvFallback: !page.shopify_store_domain && !page.shopify_admin_access_token && !!credentials,
    lastSyncedAt: page.shopify_last_synced_at,
  });
}

export async function PUT(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const pageId = typeof source.business_org_page_id === "string" ? source.business_org_page_id.trim() : "";
  const storeDomain = normalizeStoreDomain(source.shopify_store_domain);
  const accessToken = typeof source.shopify_admin_access_token === "string"
    ? source.shopify_admin_access_token.trim()
    : "";

  if (!pageId) return NextResponse.json({ error: "Business page id is required." }, { status: 400 });
  if (!storeDomain) return NextResponse.json({ error: "Shopify store domain is required." }, { status: 400 });
  if (!accessToken) return NextResponse.json({ error: "Shopify admin access token is required." }, { status: 400 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data: pageData, error: pageError } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", pageId)
    .maybeSingle();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const page = (pageData as unknown as BusinessOrgPageRow | null) ?? null;
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });
  if (!canManagePage(page, requestUser.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await client
    .from("business_organization_pages")
    .update({
      shopify_store_domain: storeDomain,
      shopify_admin_access_token: accessToken,
    })
    .eq("id", page.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    connected: true,
    storeDomain,
    hasStoredToken: true,
    lastSyncedAt: page.shopify_last_synced_at,
  });
}
