import { NextRequest, NextResponse } from "next/server";
import {
  getRequestUser,
  getServiceClientOrThrow,
  userCanManageBusiness,
} from "@/app/lib/commerce/commerceAccess";
import { COMMERCE_PRODUCT_SELECT, type CommerceProductRow } from "@/app/lib/commerce/commerceProducts";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;
  if (!productId) return NextResponse.json({ error: "Product id is required." }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updates: Partial<Pick<CommerceProductRow, "is_active" | "is_featured">> = {};
  if (typeof source.is_active === "boolean") updates.is_active = source.is_active;
  if (typeof source.is_featured === "boolean") updates.is_featured = source.is_featured;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const client = getServiceClientOrThrow();
  const { data: productData, error: productError } = await client
    .from("commerce_products")
    .select(`${COMMERCE_PRODUCT_SELECT}, business_id`)
    .eq("id", productId)
    .maybeSingle();

  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  const product = productData as (CommerceProductRow & { business_id: string }) | null;
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const canManage = await userCanManageBusiness(client, product.business_id, requestUser.id);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await client
    .from("commerce_products")
    .update(updates)
    .eq("id", productId)
    .select(COMMERCE_PRODUCT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data as unknown as CommerceProductRow });
}
