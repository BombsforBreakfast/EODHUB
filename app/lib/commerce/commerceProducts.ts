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
