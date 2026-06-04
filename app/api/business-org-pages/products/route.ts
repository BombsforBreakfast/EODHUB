import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";
import {
  BUSINESS_ORG_PRODUCT_SELECT,
  parseBusinessOrgProductInput,
  type BusinessOrgProductRow,
} from "@/app/lib/businessOrgProducts";

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

export async function GET(req: NextRequest) {
  const pageId = req.nextUrl.searchParams.get("pageId")?.trim();
  if (!pageId) return NextResponse.json({ error: "Page id is required." }, { status: 400 });

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

  const requestUser = await getRequestUser(req);
  const { data: requesterProfile } = requestUser
    ? await client
      .from("profiles")
      .select("is_admin, is_pure_admin")
      .eq("user_id", requestUser.id)
      .maybeSingle()
    : { data: null };

  const canView =
    page.is_active === true && page.verification_status === "approved" ||
    canManagePage(page, requestUser?.id ?? null) ||
    requesterProfile?.is_admin === true ||
    requesterProfile?.is_pure_admin === true;

  if (!canView) return NextResponse.json({ products: [] });

  const query = client
    .from("business_org_products")
    .select(BUSINESS_ORG_PRODUCT_SELECT)
    .eq("business_org_page_id", page.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const { data, error } = canManagePage(page, requestUser?.id ?? null) || requesterProfile?.is_admin === true || requesterProfile?.is_pure_admin === true
    ? await query
    : await query.eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: (data as unknown as BusinessOrgProductRow[]) ?? [] });
}

export async function POST(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const pageId = typeof source.business_org_page_id === "string" ? source.business_org_page_id.trim() : "";
  if (!pageId) return NextResponse.json({ error: "Business page id is required." }, { status: 400 });

  const parsed = parseBusinessOrgProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const { data: pageData, error: pageError } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", pageId)
    .maybeSingle();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const page = (pageData as unknown as BusinessOrgPageRow | null) ?? null;
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });
  if (!canManagePage(page, requestUser.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await client
    .from("business_org_products")
    .insert({
      business_org_page_id: page.id,
      ...parsed.input,
    })
    .select(BUSINESS_ORG_PRODUCT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data as unknown as BusinessOrgProductRow }, { status: 201 });
}
