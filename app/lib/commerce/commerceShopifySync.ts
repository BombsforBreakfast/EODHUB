import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "../businessOrgPages";
import { COMMERCE_PRODUCT_SELECT, type CommerceProductRow } from "./commerceProducts";
import { COMMERCE_SOURCE_SECRET_SELECT, type CommerceSourceRow } from "./commerceSources";
import { decryptCommerceSecret } from "./secretStorage";
import { fetchShopifyProductsGraphql, fetchShopifyShopDomains, type ShopifyShopDomains } from "./shopifyGraphql";

export type CommerceShopifySyncResult = {
  synced: number;
  created: number;
  updated: number;
  deactivated: number;
  products: CommerceProductRow[];
  storeUrl: string | null;
  websiteUrl: string | null;
  websiteUpdated: boolean;
};

function normalizeWebsiteHost(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

function shouldAutoUpdateWebsiteUrl(
  currentWebsiteUrl: string | null,
  previousStoreUrl: string | null,
  shopDomain: string | null,
): boolean {
  if (!currentWebsiteUrl?.trim()) return true;

  const currentHost = normalizeWebsiteHost(currentWebsiteUrl);
  if (!currentHost) return true;

  const previousHost = normalizeWebsiteHost(previousStoreUrl);
  if (previousHost && currentHost === previousHost) return true;

  const adminHost = normalizeWebsiteHost(shopDomain ? `https://${shopDomain}` : null);
  if (adminHost && currentHost === adminHost) return true;

  if (currentHost.endsWith(".myshopify.com")) return true;

  return false;
}

async function syncShopifyStoreDomain(
  client: SupabaseClient,
  source: CommerceSourceRow,
  shopDomains: ShopifyShopDomains,
): Promise<{ storeUrl: string; websiteUrl: string | null; websiteUpdated: boolean }> {
  const storeUrl = shopDomains.publicStoreUrl;
  const storeHost = normalizeWebsiteHost(storeUrl);

  const { error: sourceUpdateError } = await client
    .from("commerce_sources")
    .update({
      store_url: storeUrl,
      store_name: storeHost,
      shop_domain: shopDomains.myshopifyDomain,
    })
    .eq("id", source.id);
  if (sourceUpdateError) throw new Error(sourceUpdateError.message);

  const { data: pageData, error: pageError } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("id", source.business_id)
    .maybeSingle();
  if (pageError) throw new Error(pageError.message);

  const page = (pageData as unknown as BusinessOrgPageRow | null) ?? null;
  if (!page) {
    return { storeUrl, websiteUrl: null, websiteUpdated: false };
  }

  if (!shouldAutoUpdateWebsiteUrl(page.website_url, source.store_url, source.shop_domain)) {
    return { storeUrl, websiteUrl: page.website_url, websiteUpdated: false };
  }

  const { error: websiteError } = await client
    .from("business_organization_pages")
    .update({ website_url: storeUrl })
    .eq("id", page.id);
  if (websiteError) throw new Error(websiteError.message);

  return { storeUrl, websiteUrl: storeUrl, websiteUpdated: true };
}

export async function syncCommerceShopifyProducts(
  client: SupabaseClient,
  commerceSourceId: string,
  options?: { limit?: number },
): Promise<CommerceShopifySyncResult> {
  const { data: sourceData, error: sourceError } = await client
    .from("commerce_sources")
    .select(COMMERCE_SOURCE_SECRET_SELECT)
    .eq("id", commerceSourceId)
    .maybeSingle();

  if (sourceError) throw new Error(sourceError.message);
  const source = (sourceData as unknown as CommerceSourceRow | null) ?? null;
  if (!source) throw new Error("Commerce source not found.");
  if (source.platform_type !== "shopify") throw new Error("Unsupported commerce platform.");
  if (!source.shop_domain) throw new Error("Shop domain is not configured.");

  const accessToken = decryptCommerceSecret(source.shopify_access_token_encrypted);
  if (!accessToken) {
    throw new Error("Shopify is not connected for this business.");
  }

  await client
    .from("commerce_sources")
    .update({ sync_status: "pending" })
    .eq("id", source.id);

  try {
    const shopDomains = await fetchShopifyShopDomains(source.shop_domain, accessToken);
    const domainSync = await syncShopifyStoreDomain(client, source, shopDomains);

    const shopifyProducts = await fetchShopifyProductsGraphql(
      source.shop_domain,
      accessToken,
      options?.limit ?? 50,
      shopDomains.publicStoreUrl,
    );

    const { data: existingRows, error: existingError } = await client
      .from("commerce_products")
      .select(COMMERCE_PRODUCT_SELECT)
      .eq("commerce_source_id", source.id)
      .eq("platform_type", "shopify");

    if (existingError) throw new Error(existingError.message);

    const existingByExternalId = new Map<string, CommerceProductRow>();
    for (const row of (existingRows as unknown as CommerceProductRow[]) ?? []) {
      existingByExternalId.set(row.external_product_id, row);
    }

    let created = 0;
    let updated = 0;
    const syncedExternalIds = new Set<string>();

    for (const [index, product] of shopifyProducts.entries()) {
      syncedExternalIds.add(product.externalProductId);
      const existing = existingByExternalId.get(product.externalProductId);
      const payload = {
        business_id: source.business_id,
        commerce_source_id: source.id,
        platform_type: "shopify",
        external_product_id: product.externalProductId,
        title: product.title,
        description: product.description,
        image_url: product.imageUrl,
        price: product.price,
        currency: product.currency,
        product_url: product.productUrl,
        checkout_url: product.checkoutUrl,
        inventory_status: product.inventoryStatus,
        sort_order: index,
        is_active: true,
        raw_shopify_payload: product.rawPayload,
      };

      if (existing) {
        const { error } = await client.from("commerce_products").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
        updated += 1;
      } else {
        const { error } = await client.from("commerce_products").insert(payload);
        if (error) throw new Error(error.message);
        created += 1;
      }
    }

    const staleIds = ((existingRows as unknown as CommerceProductRow[]) ?? [])
      .filter((row) => !syncedExternalIds.has(row.external_product_id))
      .map((row) => row.id);

    let deactivated = 0;
    if (staleIds.length > 0) {
      const { error } = await client
        .from("commerce_products")
        .update({ is_active: false })
        .in("id", staleIds);
      if (error) throw new Error(error.message);
      deactivated = staleIds.length;
    }

    const now = new Date().toISOString();
    const { error: sourceUpdateError } = await client
      .from("commerce_sources")
      .update({
        sync_status: "connected",
        api_enabled: true,
        last_synced_at: now,
        store_url: domainSync.storeUrl,
      })
      .eq("id", source.id);
    if (sourceUpdateError) throw new Error(sourceUpdateError.message);

    const { data: products, error: productsError } = await client
      .from("commerce_products")
      .select(COMMERCE_PRODUCT_SELECT)
      .eq("commerce_source_id", source.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (productsError) throw new Error(productsError.message);

    return {
      synced: shopifyProducts.length,
      created,
      updated,
      deactivated,
      products: (products as unknown as CommerceProductRow[]) ?? [],
      storeUrl: domainSync.storeUrl,
      websiteUrl: domainSync.websiteUrl,
      websiteUpdated: domainSync.websiteUpdated,
    };
  } catch (error) {
    await client
      .from("commerce_sources")
      .update({ sync_status: "sync_failed" })
      .eq("id", source.id);
    throw error;
  }
}
