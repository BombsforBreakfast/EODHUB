export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  status: string;
  image: { src: string } | null;
  images: Array<{ src: string }>;
  variants: Array<{ price: string }>;
};

export type ShopifyProductsResponse = {
  products: ShopifyProduct[];
};

export type ShopifyShopResponse = {
  shop: {
    domain: string;
    myshopify_domain: string;
  };
};

export type NormalizedShopifyProduct = {
  externalId: string;
  name: string;
  description: string | null;
  priceText: string | null;
  imageUrl: string;
  productUrl: string;
};

const SHOPIFY_API_VERSION = "2024-10";

function normalizeStoreDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

function formatPrice(price: string | undefined): string | null {
  if (!price) return null;
  const trimmed = price.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

export function resolveShopifyCredentials(input: {
  pageStoreDomain?: string | null;
  pageAccessToken?: string | null;
  envStoreDomain?: string | null;
  envAccessToken?: string | null;
}): { storeDomain: string; accessToken: string } | null {
  const storeDomain = normalizeStoreDomain(input.pageStoreDomain ?? input.envStoreDomain ?? "");
  const accessToken = (input.pageAccessToken ?? input.envAccessToken ?? "").trim();
  if (!storeDomain || !accessToken) return null;
  return { storeDomain, accessToken };
}

async function shopifyFetch<T>(storeDomain: string, accessToken: string, path: string): Promise<T> {
  const url = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify API ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function fetchShopifyShopDomain(storeDomain: string, accessToken: string): Promise<string> {
  const data = await shopifyFetch<ShopifyShopResponse>(storeDomain, accessToken, "/shop.json");
  return normalizeStoreDomain(data.shop.domain || data.shop.myshopify_domain || storeDomain);
}

export async function fetchShopifyProducts(
  storeDomain: string,
  accessToken: string,
  limit = 50,
): Promise<NormalizedShopifyProduct[]> {
  const publicDomain = await fetchShopifyShopDomain(storeDomain, accessToken);
  const data = await shopifyFetch<ShopifyProductsResponse>(
    storeDomain,
    accessToken,
    `/products.json?limit=${Math.min(Math.max(limit, 1), 250)}&status=active`,
  );

  return (data.products ?? [])
    .map((product) => {
      const imageUrl = product.image?.src ?? product.images?.[0]?.src ?? null;
      if (!imageUrl) return null;

      return {
        externalId: String(product.id),
        name: product.title.trim(),
        description: stripHtml(product.body_html),
        priceText: formatPrice(product.variants?.[0]?.price),
        imageUrl,
        productUrl: `https://${publicDomain}/products/${product.handle}`,
      } satisfies NormalizedShopifyProduct;
    })
    .filter((product): product is NormalizedShopifyProduct => !!product && product.name.length > 0);
}
