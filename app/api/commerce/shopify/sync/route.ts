import { NextRequest, NextResponse } from "next/server";
import { syncCommerceShopifyProducts } from "@/app/lib/commerce/commerceShopifySync";
import {
  getRequestUser,
  getServiceClientOrThrow,
  userCanManageBusiness,
} from "@/app/lib/commerce/commerceAccess";
import { COMMERCE_SOURCE_PUBLIC_SELECT, toSafeCommerceSource, type CommerceSourceRow } from "@/app/lib/commerce/commerceSources";

export const dynamic = "force-dynamic";

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
  const commerceSourceId = typeof source.commerceSourceId === "string" ? source.commerceSourceId.trim() : "";
  const limit = typeof source.limit === "number" ? source.limit : undefined;

  if (!commerceSourceId) {
    return NextResponse.json({ error: "commerceSourceId is required." }, { status: 400 });
  }

  const client = getServiceClientOrThrow();
  const { data: sourceRow, error: sourceError } = await client
    .from("commerce_sources")
    .select(`${COMMERCE_SOURCE_PUBLIC_SELECT}, business_id`)
    .eq("id", commerceSourceId)
    .maybeSingle();

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  const commerceSource = sourceRow as (CommerceSourceRow & { business_id: string }) | null;
  if (!commerceSource) return NextResponse.json({ error: "Commerce source not found." }, { status: 404 });

  const canManage = await userCanManageBusiness(client, commerceSource.business_id, requestUser.id);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await syncCommerceShopifyProducts(client, commerceSourceId, { limit });
    return NextResponse.json({
      ...result,
      source: toSafeCommerceSource(commerceSource),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify sync failed.";
    console.error("Shopify commerce sync error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
