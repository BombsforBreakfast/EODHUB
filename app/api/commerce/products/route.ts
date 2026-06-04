import { NextRequest, NextResponse } from "next/server";
import {
  getRequestUser,
  getServiceClientOrThrow,
  userCanManageBusiness,
} from "@/app/lib/commerce/commerceAccess";
import {
  COMMERCE_PRODUCT_SELECT,
  parseManualCommerceProductInput,
  type CommerceProductRow,
} from "@/app/lib/commerce/commerceProducts";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

function positiveIntParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId")?.trim();
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  const page = positiveIntParam(req.nextUrl.searchParams.get("page"), 1, 10_000);
  const pageSize = positiveIntParam(req.nextUrl.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";

  const client = getServiceClientOrThrow();
  const requestUser = await getRequestUser(req);

  const { data: pageData } = await client
    .from("business_organization_pages")
    .select("id, verification_status, is_active")
    .eq("id", businessId)
    .maybeSingle();

  if (!pageData) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const isPubliclyVisible = pageData.is_active === true && pageData.verification_status === "approved";
  let canManage = false;
  if (requestUser) {
    canManage = await userCanManageBusiness(client, businessId, requestUser.id);
  }

  if (!isPubliclyVisible && !canManage) {
    return NextResponse.json({
      products: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
    });
  }

  let query = client
    .from("commerce_products")
    .select(COMMERCE_PRODUCT_SELECT, { count: "exact" })
    .eq("business_id", businessId)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (!(canManage && includeInactive)) {
    query = query.eq("is_active", true);
  }

  if (search) {
    const q = escapeIlike(search);
    query = query.or(
      `title.ilike.%${q}%,description.ilike.%${q}%,platform_type.ilike.%${q}%,inventory_status.ilike.%${q}%,currency.ilike.%${q}%`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    products: (data as unknown as CommerceProductRow[]) ?? [],
    page,
    pageSize,
    total,
    totalPages,
  });
}

export async function POST(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  const parsed = parseManualCommerceProductInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const client = getServiceClientOrThrow();
  const canManage = await userCanManageBusiness(client, businessId, requestUser.id);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existingSource, error: sourceLoadError } = await client
    .from("commerce_sources")
    .select("id")
    .eq("business_id", businessId)
    .eq("platform_type", "manual")
    .maybeSingle();

  if (sourceLoadError) return NextResponse.json({ error: sourceLoadError.message }, { status: 500 });

  let manualSourceId = (existingSource as { id: string } | null)?.id ?? null;
  if (!manualSourceId) {
    const { data: sourceData, error: sourceError } = await client
      .from("commerce_sources")
      .insert({
        business_id: businessId,
        platform_type: "manual",
        store_name: "Manual products",
        sync_status: "connected",
        api_enabled: false,
        is_active: true,
        created_by: requestUser.id,
      })
      .select("id")
      .single();

    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
    manualSourceId = (sourceData as { id: string }).id;
  }

  const { data, error } = await client
    .from("commerce_products")
    .insert({
      business_id: businessId,
      commerce_source_id: manualSourceId,
      platform_type: "manual",
      external_product_id: `manual:${crypto.randomUUID()}`,
      title: parsed.input.title,
      description: parsed.input.description,
      image_url: parsed.input.image_url,
      price: parsed.input.price,
      currency: parsed.input.currency,
      product_url: parsed.input.product_url,
      checkout_url: parsed.input.product_url,
      inventory_status: "available",
      is_active: true,
      is_featured: false,
      raw_shopify_payload: null,
    })
    .select(COMMERCE_PRODUCT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data as unknown as CommerceProductRow }, { status: 201 });
}
