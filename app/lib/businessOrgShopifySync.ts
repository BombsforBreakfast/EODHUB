import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchShopifyProducts, resolveShopifyCredentials } from "./shopify";
import { BUSINESS_ORG_PRODUCT_SELECT, type BusinessOrgProductRow } from "./businessOrgProducts";

export type ShopifySyncResult = {
  synced: number;
  created: number;
  updated: number;
  deactivated: number;
  products: BusinessOrgProductRow[];
};

type PageShopifyFields = {
  id: string;
  shopify_store_domain: string | null;
  shopify_admin_access_token: string | null;
};

export async function syncBusinessOrgShopifyProducts(
  client: SupabaseClient,
  page: PageShopifyFields,
  options?: { limit?: number },
): Promise<ShopifySyncResult> {
  const credentials = resolveShopifyCredentials({
    pageStoreDomain: page.shopify_store_domain,
    pageAccessToken: page.shopify_admin_access_token,
    envStoreDomain: process.env.SHOPIFY_STORE_DOMAIN,
    envAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  });

  if (!credentials) {
    throw new Error("Shopify is not configured for this business page.");
  }

  const shopifyProducts = await fetchShopifyProducts(
    credentials.storeDomain,
    credentials.accessToken,
    options?.limit ?? 50,
  );

  const { data: existingRows, error: existingError } = await client
    .from("business_org_products")
    .select(BUSINESS_ORG_PRODUCT_SELECT)
    .eq("business_org_page_id", page.id)
    .eq("external_source", "shopify");

  if (existingError) throw new Error(existingError.message);

  const existingByExternalId = new Map<string, BusinessOrgProductRow>();
  for (const row of (existingRows as unknown as BusinessOrgProductRow[]) ?? []) {
    if (row.external_id) existingByExternalId.set(row.external_id, row);
  }

  let created = 0;
  let updated = 0;
  const syncedExternalIds = new Set<string>();

  for (const [index, product] of shopifyProducts.entries()) {
    syncedExternalIds.add(product.externalId);
    const existing = existingByExternalId.get(product.externalId);
    const payload = {
      business_org_page_id: page.id,
      name: product.name,
      description: product.description,
      price_text: product.priceText,
      image_url: product.imageUrl,
      product_url: product.productUrl,
      sort_order: index,
      is_active: true,
      external_source: "shopify",
      external_id: product.externalId,
    };

    if (existing) {
      const { error } = await client
        .from("business_org_products")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      updated += 1;
    } else {
      const { error } = await client.from("business_org_products").insert(payload);
      if (error) throw new Error(error.message);
      created += 1;
    }
  }

  const staleIds = ((existingRows as unknown as BusinessOrgProductRow[]) ?? [])
    .filter((row) => row.external_id && !syncedExternalIds.has(row.external_id))
    .map((row) => row.id);

  let deactivated = 0;
  if (staleIds.length > 0) {
    const { error } = await client
      .from("business_org_products")
      .update({ is_active: false })
      .in("id", staleIds);
    if (error) throw new Error(error.message);
    deactivated = staleIds.length;
  }

  const { error: pageError } = await client
    .from("business_organization_pages")
    .update({ shopify_last_synced_at: new Date().toISOString() })
    .eq("id", page.id);
  if (pageError) throw new Error(pageError.message);

  const { data: products, error: productsError } = await client
    .from("business_org_products")
    .select(BUSINESS_ORG_PRODUCT_SELECT)
    .eq("business_org_page_id", page.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (productsError) throw new Error(productsError.message);

  return {
    synced: shopifyProducts.length,
    created,
    updated,
    deactivated,
    products: (products as unknown as BusinessOrgProductRow[]) ?? [],
  };
}
