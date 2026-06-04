import { createHmac, timingSafeEqual } from "node:crypto";

export type ShopifyOAuthConfig = {
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
};

export type ShopifyOAuthState = {
  businessId: string;
  commerceSourceId: string;
  userId: string;
  shopDomain: string;
  exp: number;
};

function getShopifyOAuthConfig(): ShopifyOAuthConfig | null {
  const clientId = process.env.SHOPIFY_APP_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET?.trim();
  const redirectUri = process.env.SHOPIFY_APP_REDIRECT_URI?.trim();
  const scopes = process.env.SHOPIFY_APP_SCOPES?.trim() || "read_products";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, scopes, redirectUri };
}

function signStatePayload(payload: ShopifyOAuthState, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function createShopifyOAuthState(payload: ShopifyOAuthState): string | null {
  const config = getShopifyOAuthConfig();
  if (!config) return null;
  return signStatePayload(payload, config.clientSecret);
}

export function parseShopifyOAuthState(state: string): ShopifyOAuthState | null {
  const config = getShopifyOAuthConfig();
  if (!config) return null;

  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", config.clientSecret).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ShopifyOAuthState;
    if (!parsed.businessId || !parsed.commerceSourceId || !parsed.userId || !parsed.shopDomain || !parsed.exp) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildShopifyAuthorizeUrl(shopDomain: string, state: string): string | null {
  const config = getShopifyOAuthConfig();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes,
    redirect_uri: config.redirectUri,
    state,
  });

  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyOAuthCallbackHmac(query: URLSearchParams): boolean {
  const config = getShopifyOAuthConfig();
  if (!config) return false;

  const hmac = query.get("hmac");
  if (!hmac) return false;

  const entries = [...query.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHmac("sha256", config.clientSecret).update(entries).digest("hex");
  const digestBuf = Buffer.from(digest, "utf8");
  const hmacBuf = Buffer.from(hmac, "utf8");
  return digestBuf.length === hmacBuf.length && timingSafeEqual(digestBuf, hmacBuf);
}

export type ShopifyTokenResponse = {
  access_token: string;
  scope: string;
};

/**
 * Exchanges the OAuth authorization code for a Shopify Admin API access token.
 * This replaces the legacy Dev Dashboard "copy Admin API token" flow.
 */
export async function exchangeShopifyOAuthCode(
  shopDomain: string,
  code: string,
): Promise<ShopifyTokenResponse> {
  const config = getShopifyOAuthConfig();
  if (!config) throw new Error("Shopify OAuth is not configured on the server.");

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as ShopifyTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Shopify token exchange failed (${res.status})`);
  }

  return data;
}

export function getShopifyAppClientCredentials() {
  const config = getShopifyOAuthConfig();
  if (!config) return null;
  return { clientId: config.clientId, clientSecret: config.clientSecret, scopes: config.scopes };
}

export function getShopifyRedirectUri(): string | null {
  return process.env.SHOPIFY_APP_REDIRECT_URI?.trim() || null;
}
