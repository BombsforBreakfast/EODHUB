import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";
import { BUSINESS_ORG_PRODUCT_SELECT, type BusinessOrgProductRow } from "@/app/lib/businessOrgProducts";

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;
  if (!productId) return NextResponse.json({ error: "Product id is required." }, { status: 400 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data: productData, error: productError } = await client
    .from("business_org_products")
    .select(BUSINESS_ORG_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();

  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  const product = (productData as unknown as BusinessOrgProductRow | null) ?? null;
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const { data: pageData, error: pageError } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", product.business_org_page_id)
    .maybeSingle();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const page = (pageData as unknown as BusinessOrgPageRow | null) ?? null;
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });

  const canDelete = page.owner_user_id === requestUser.id || page.business_auth_user_id === requestUser.id;
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await client
    .from("business_org_products")
    .delete()
    .eq("id", product.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
