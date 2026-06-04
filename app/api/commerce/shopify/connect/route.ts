import { NextRequest, NextResponse } from "next/server";
import {
  buildShopifyAuthorizeUrl,
  createShopifyOAuthState,
  getShopifyAppClientCredentials,
} from "@/app/lib/commerce/shopifyOAuth";
import {
  getRequestUser,
  getServiceClientOrThrow,
  normalizeShopDomain,
  userCanManageBusiness,
} from "@/app/lib/commerce/commerceAccess";
import { encryptCommerceSecret } from "@/app/lib/commerce/secretStorage";
import { COMMERCE_SOURCE_PUBLIC_SELECT, toSafeCommerceSource, type CommerceSourceRow } from "@/app/lib/commerce/commerceSources";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credentials = getShopifyAppClientCredentials();
  if (!credentials) {
    return NextResponse.json({ error: "Shopify OAuth is not configured on the server." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const businessId = typeof source.businessId === "string" ? source.businessId.trim() : "";
  const shopDomain = normalizeShopDomain(source.shopDomain);
  const commerceSourceIdInput = typeof source.commerceSourceId === "string" ? source.commerceSourceId.trim() : "";

  if (!businessId) return NextResponse.json({ error: "Business id is required." }, { status: 400 });
  if (!shopDomain) return NextResponse.json({ error: "A valid Shopify shop domain is required." }, { status: 400 });

  const client = getServiceClientOrThrow();
  const canManage = await userCanManageBusiness(client, businessId, requestUser.id);
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let commerceSourceId = commerceSourceIdInput;
  if (commerceSourceId) {
    const { data: existing } = await client
      .from("commerce_sources")
      .select("id, business_id")
      .eq("id", commerceSourceId)
      .maybeSingle();
    if (!existing || existing.business_id !== businessId) {
      return NextResponse.json({ error: "Commerce source not found." }, { status: 404 });
    }
  } else {
    const { data: created, error: createError } = await client
      .from("commerce_sources")
      .upsert(
        {
          business_id: businessId,
          platform_type: "shopify",
          shop_domain: shopDomain,
          sync_status: "pending",
          shopify_installation_status: "pending",
          shopify_client_id: credentials.clientId,
          shopify_client_secret_encrypted: encryptCommerceSecret(credentials.clientSecret),
          created_by: requestUser.id,
          is_active: true,
        },
        { onConflict: "business_id,platform_type" },
      )
      .select(COMMERCE_SOURCE_PUBLIC_SELECT)
      .single();

    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    commerceSourceId = (created as unknown as CommerceSourceRow).id;
  }

  await client
    .from("commerce_sources")
    .update({
      shop_domain: shopDomain,
      sync_status: "pending",
      shopify_installation_status: "pending",
      shopify_client_id: credentials.clientId,
      shopify_client_secret_encrypted: encryptCommerceSecret(credentials.clientSecret),
    })
    .eq("id", commerceSourceId);

  const state = createShopifyOAuthState({
    businessId,
    commerceSourceId,
    userId: requestUser.id,
    shopDomain,
    exp: Date.now() + 10 * 60 * 1000,
  });
  if (!state) return NextResponse.json({ error: "Could not create OAuth state." }, { status: 500 });

  const authorizeUrl = buildShopifyAuthorizeUrl(shopDomain, state);
  if (!authorizeUrl) return NextResponse.json({ error: "Could not build Shopify authorization URL." }, { status: 500 });

  return NextResponse.json({ authorizeUrl, commerceSourceId });
}

export async function GET(req: NextRequest) {
  const requestUser = await getRequestUser(req);
  if (!requestUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId")?.trim();
  const shopDomain = normalizeShopDomain(req.nextUrl.searchParams.get("shopDomain"));
  if (!businessId || !shopDomain) {
    return NextResponse.json({ error: "businessId and shopDomain are required." }, { status: 400 });
  }

  const postReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ businessId, shopDomain }),
  });
  const jsonRes = await POST(postReq);
  const data = (await jsonRes.json()) as { authorizeUrl?: string; error?: string };
  if (!jsonRes.ok || !data.authorizeUrl) {
    return NextResponse.json({ error: data.error ?? "Could not start Shopify connect." }, { status: jsonRes.status });
  }

  return NextResponse.redirect(data.authorizeUrl);
}
