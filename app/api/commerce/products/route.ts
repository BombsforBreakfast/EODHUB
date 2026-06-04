import { NextRequest, NextResponse } from "next/server";
import {
  getRequestUser,
  getServiceClientOrThrow,
  userCanManageBusiness,
} from "@/app/lib/commerce/commerceAccess";
import { COMMERCE_PRODUCT_SELECT, type CommerceProductRow } from "@/app/lib/commerce/commerceProducts";

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
