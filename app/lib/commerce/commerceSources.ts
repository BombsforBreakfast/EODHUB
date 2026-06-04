export type CommerceSyncStatus =
  | "not_configured"
  | "pending"
  | "connected"
  | "sync_failed"
  | "disabled";

export type CommerceSourceRow = {
  id: string;
  business_id: string;
  platform_type: string;
  store_name: string | null;
  store_url: string | null;
  shop_domain: string | null;
  api_enabled: boolean;
  sync_status: CommerceSyncStatus;
  last_synced_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  shopify_client_id: string | null;
  shopify_client_secret_encrypted: string | null;
  shopify_access_token_encrypted: string | null;
  shopify_token_expires_at: string | null;
  shopify_scope: string | null;
  shopify_installation_status: string;
};

/** Safe fields only — never include encrypted secrets. */
export const COMMERCE_SOURCE_PUBLIC_SELECT = [
  "id",
  "business_id",
  "platform_type",
  "store_name",
  "store_url",
  "shop_domain",
  "api_enabled",
  "sync_status",
  "last_synced_at",
  "is_active",
  "created_at",
  "updated_at",
  "shopify_scope",
  "shopify_installation_status",
].join(", ");

export const COMMERCE_SOURCE_SECRET_SELECT = [
  COMMERCE_SOURCE_PUBLIC_SELECT,
  "shopify_client_id",
  "shopify_client_secret_encrypted",
  "shopify_access_token_encrypted",
  "shopify_token_expires_at",
  "created_by",
].join(", ");

export type SafeCommerceSource = Omit<
  CommerceSourceRow,
  "shopify_client_id" | "shopify_client_secret_encrypted" | "shopify_access_token_encrypted" | "shopify_token_expires_at" | "created_by"
>;

export function toSafeCommerceSource(row: CommerceSourceRow): SafeCommerceSource {
  const {
    shopify_client_id: _a,
    shopify_client_secret_encrypted: _b,
    shopify_access_token_encrypted: _c,
    shopify_token_expires_at: _d,
    created_by: _e,
    ...safe
  } = row;
  return safe;
}
