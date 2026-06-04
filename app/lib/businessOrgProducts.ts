export type BusinessOrgProductRow = {
  id: string;
  business_org_page_id: string;
  name: string;
  description: string | null;
  price_text: string | null;
  image_url: string;
  product_url: string;
  sort_order: number;
  is_active: boolean;
  external_source?: string | null;
  external_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessOrgProductInput = {
  name: string;
  description?: string | null;
  price_text?: string | null;
  image_url: string;
  product_url: string;
};

export const BUSINESS_ORG_PRODUCT_SELECT = [
  "id",
  "business_org_page_id",
  "name",
  "description",
  "price_text",
  "image_url",
  "product_url",
  "sort_order",
  "is_active",
  "external_source",
  "external_id",
  "created_at",
  "updated_at",
].join(", ");

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

export function parseBusinessOrgProductInput(body: unknown): { ok: true; input: BusinessOrgProductInput } | { ok: false; message: string } {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = normalizeText(source.name);
  const description = nullableText(source.description);
  const priceText = nullableText(source.price_text);
  const imageUrl = normalizeUrl(source.image_url);
  const productUrl = normalizeUrl(source.product_url);

  if (!name) return { ok: false, message: "Product name is required." };
  if (name.length > 160) return { ok: false, message: "Product name must be 160 characters or fewer." };
  if (description && description.length > 1000) return { ok: false, message: "Product description must be 1000 characters or fewer." };
  if (priceText && priceText.length > 80) return { ok: false, message: "Product price must be 80 characters or fewer." };
  if (!imageUrl) return { ok: false, message: "A valid product photo URL is required." };
  if (!productUrl) return { ok: false, message: "A valid product URL is required." };

  return {
    ok: true,
    input: {
      name,
      description,
      price_text: priceText,
      image_url: imageUrl,
      product_url: productUrl,
    },
  };
}
