const SHOPIFY_API_VERSION = "2024-10";

export type NormalizedShopifyCommerceProduct = {
  externalProductId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  productUrl: string | null;
  checkoutUrl: string | null;
  inventoryStatus: string | null;
  rawPayload: Record<string, unknown>;
};

type ShopifyGraphqlProductNode = {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  onlineStoreUrl: string | null;
  status: string;
  featuredImage: { url: string } | null;
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string };
  } | null;
  variants: {
    edges: Array<{
      node: {
        id: string;
        price: string;
        availableForSale: boolean;
        inventoryQuantity: number | null;
      };
    }>;
  };
};

type ShopifyProductsQueryResponse = {
  data?: {
    products?: {
      edges: Array<{ node: ShopifyGraphqlProductNode }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    shop?: { primaryDomain: { url: string } | null; myshopifyDomain: string };
  };
  errors?: Array<{ message: string }>;
};

const PRODUCTS_QUERY = `
  query CommerceProducts($first: Int!, $after: String) {
    shop {
      primaryDomain { url }
      myshopifyDomain
    }
    products(first: $first, after: $after, query: "status:active") {
      edges {
        node {
          id
          title
          handle
          description
          onlineStoreUrl
          status
          featuredImage { url }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
          }
          variants(first: 1) {
            edges {
              node {
                id
                price
                availableForSale
                inventoryQuantity
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function gidToNumericId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

function normalizeDomain(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export type ShopifyShopDomains = {
  primaryDomainUrl: string | null;
  myshopifyDomain: string;
  publicStoreUrl: string;
};

const SHOP_DOMAINS_QUERY = `
  query CommerceShopDomains {
    shop {
      primaryDomain { url }
      myshopifyDomain
    }
  }
`;

export async function fetchShopifyShopDomains(
  shopDomain: string,
  accessToken: string,
): Promise<ShopifyShopDomains> {
  const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: SHOP_DOMAINS_QUERY }),
    cache: "no-store",
  });

  const payload = (await res.json()) as ShopifyProductsQueryResponse;
  if (!res.ok) {
    throw new Error(`Shopify GraphQL ${res.status}`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }

  const primary = payload.data?.shop?.primaryDomain?.url ?? null;
  const myshopify = payload.data?.shop?.myshopifyDomain ?? shopDomain;
  const publicHost = normalizeDomain(primary || myshopify || shopDomain);

  return {
    primaryDomainUrl: primary,
    myshopifyDomain: normalizeDomain(myshopify),
    publicStoreUrl: `https://${publicHost}`,
  };
}

export async function fetchShopifyProductsGraphql(
  shopDomain: string,
  accessToken: string,
  limit = 50,
  shopBaseUrl?: string | null,
): Promise<NormalizedShopifyCommerceProduct[]> {
  const products: NormalizedShopifyCommerceProduct[] = [];
  let after: string | null = null;
  let shopBaseUrlResolved = shopBaseUrl ? normalizeDomain(shopBaseUrl) : null;

  while (products.length < limit) {
    const batchSize = Math.min(50, limit - products.length);
    const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: PRODUCTS_QUERY,
        variables: { first: batchSize, after },
      }),
      cache: "no-store",
    });

    const payload = (await res.json()) as ShopifyProductsQueryResponse;
    if (!res.ok) {
      throw new Error(`Shopify GraphQL ${res.status}`);
    }
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }

    if (!shopBaseUrlResolved) {
      const primary = payload.data?.shop?.primaryDomain?.url;
      const myshopify = payload.data?.shop?.myshopifyDomain;
      shopBaseUrlResolved = normalizeDomain(primary || myshopify || shopDomain);
    }

    const edges = payload.data?.products?.edges ?? [];
    for (const edge of edges) {
      const node = edge.node;
      const variant = node.variants.edges[0]?.node;
      const priceAmount = variant?.price ?? node.priceRangeV2?.minVariantPrice.amount ?? null;
      const currency = node.priceRangeV2?.minVariantPrice.currencyCode ?? "USD";
      const productUrl = node.onlineStoreUrl || (node.handle ? `https://${shopBaseUrlResolved}/products/${node.handle}` : null);
      const inventoryStatus = variant
        ? variant.availableForSale
          ? "in_stock"
          : "out_of_stock"
        : null;

      products.push({
        externalProductId: gidToNumericId(node.id),
        title: node.title.trim(),
        description: node.description?.trim() || null,
        imageUrl: node.featuredImage?.url ?? null,
        price: priceAmount != null ? Number(priceAmount) : null,
        currency,
        productUrl,
        checkoutUrl: productUrl,
        inventoryStatus,
        rawPayload: node as unknown as Record<string, unknown>,
      });
    }

    const pageInfo = payload.data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return products.filter((product) => product.title.length > 0);
}
