export type CommerceProductRow = {
  id: string;
  business_id: string;
  commerce_source_id: string;
  platform_type: string;
  external_product_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  currency: string;
  product_url: string | null;
  checkout_url: string | null;
  inventory_status: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  raw_shopify_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ManualCommerceProductInput = {
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  product_url: string;
  image_url: string | null;
};

export const COMMERCE_PRODUCT_SELECT = [
  "id",
  "business_id",
  "commerce_source_id",
  "platform_type",
  "external_product_id",
  "title",
  "description",
  "image_url",
  "price",
  "currency",
  "product_url",
  "checkout_url",
  "inventory_status",
  "is_active",
  "is_featured",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

export function formatCommercePrice(price: number | null, currency: string): string | null {
  if (price == null || Number.isNaN(price)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeUrl(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parsePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const text = typeof value === "number" ? String(value) : normalizeText(value);
  if (!text) return null;
  const cleaned = text.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return Math.round(parsed * 100) / 100;
}

export function parseManualCommerceProductInput(
  body: unknown,
): { ok: true; input: ManualCommerceProductInput } | { ok: false; message: string } {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const title = normalizeText(source.title);
  const description = nullableText(source.description);
  const price = parsePrice(source.price);
  const currency = normalizeText(source.currency).toUpperCase() || "USD";
  const productUrl = normalizeUrl(source.product_url);
  const imageUrl = normalizeUrl(source.image_url);

  if (!title) return { ok: false, message: "Product name is required." };
  if (title.length > 200) return { ok: false, message: "Product name must be 200 characters or fewer." };
  if (description && description.length > 1000) return { ok: false, message: "Description must be 1000 characters or fewer." };
  if (Number.isNaN(price)) return { ok: false, message: "Enter a valid product price." };
  if (currency.length !== 3) return { ok: false, message: "Currency must be a 3-letter code." };
  if (!productUrl) return { ok: false, message: "A valid external product URL is required." };

  return {
    ok: true,
    input: {
      title,
      description,
      price,
      currency,
      product_url: productUrl,
      image_url: imageUrl,
    },
  };
}
