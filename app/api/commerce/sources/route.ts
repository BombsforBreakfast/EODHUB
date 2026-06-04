import { NextRequest, NextResponse } from "next/server";
import {
  getRequestUser,
  getServiceClientOrThrow,
  userCanManageBusiness,
} from "@/app/lib/commerce/commerceAccess";
import { COMMERCE_SOURCE_PUBLIC_SELECT, toSafeCommerceSource, type CommerceSourceRow } from "@/app/lib/commerce/commerceSources";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId")?.trim();
  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  const client = getServiceClientOrThrow();
  const requestUser = await getRequestUser(req);

  const { data: pageData } = await client
    .from("business_organization_pages")
    .select("id, verification_status, is_active, business_auth_user_id, owner_user_id")
    .eq("id", businessId)
    .maybeSingle();

  if (!pageData) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  const isPubliclyVisible = pageData.is_active === true && pageData.verification_status === "approved";
  let canManage = false;
  if (requestUser) {
    canManage = await userCanManageBusiness(client, businessId, requestUser.id);
  }

  if (!isPubliclyVisible && !canManage) {
    return NextResponse.json({ sources: [] });
  }

  const query = client
    .from("commerce_sources")
    .select(COMMERCE_SOURCE_PUBLIC_SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const { data, error } = canManage ? await query : await query.eq("is_active", true).eq("sync_status", "connected");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sources = ((data as unknown as CommerceSourceRow[]) ?? []).map(toSafeCommerceSource);
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const businessId = typeof source.businessId === "string" ? source.businessId.trim() : "";
  const platformType = typeof source.platformType === "string" ? source.platformType.trim() : "shopify";

  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });
  if (platformType !== "shopify") return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });

  const client = getServiceClientOrThrow();
  const canManage = await userCanManageBusiness(client, businessId, requestUser.id);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await client
    .from("commerce_sources")
    .upsert(
      {
        business_id: businessId,
        platform_type: "shopify",
        sync_status: "not_configured",
        shopify_installation_status: "not_installed",
        created_by: requestUser.id,
        is_active: true,
      },
      { onConflict: "business_id,platform_type" },
    )
    .select(COMMERCE_SOURCE_PUBLIC_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: toSafeCommerceSource(data as unknown as CommerceSourceRow) }, { status: 201 });
}
