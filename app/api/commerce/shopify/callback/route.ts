import { NextRequest, NextResponse } from "next/server";
import {
  exchangeShopifyOAuthCode,
  parseShopifyOAuthState,
  verifyShopifyOAuthCallbackHmac,
} from "@/app/lib/commerce/shopifyOAuth";
import { getServiceClientOrThrow, normalizeShopDomain } from "@/app/lib/commerce/commerceAccess";
import { encryptCommerceSecret } from "@/app/lib/commerce/secretStorage";
import { syncCommerceShopifyProducts } from "@/app/lib/commerce/commerceShopifySync";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

function appBaseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams;
  if (!verifyShopifyOAuthCallbackHmac(query)) {
    return NextResponse.redirect(`${appBaseUrl(req)}/account/business-pages?commerce=invalid_hmac`);
  }

  const code = query.get("code")?.trim();
  const stateRaw = query.get("state")?.trim();
  const shop = normalizeShopDomain(query.get("shop"));
  if (!code || !stateRaw || !shop) {
    return NextResponse.redirect(`${appBaseUrl(req)}/account/business-pages?commerce=missing_params`);
  }

  const state = parseShopifyOAuthState(stateRaw);
  if (!state || state.shopDomain !== shop) {
    return NextResponse.redirect(`${appBaseUrl(req)}/account/business-pages?commerce=invalid_state`);
  }

  try {
    const token = await exchangeShopifyOAuthCode(shop, code);
    const client = getServiceClientOrThrow();

    const { error: updateError } = await client
      .from("commerce_sources")
      .update({
        shop_domain: shop,
        shopify_access_token_encrypted: encryptCommerceSecret(token.access_token),
        shopify_scope: token.scope,
        shopify_installation_status: "installed",
        sync_status: "connected",
        api_enabled: true,
        store_name: shop,
      })
      .eq("id", state.commerceSourceId)
      .eq("business_id", state.businessId);

    if (updateError) throw new Error(updateError.message);

    try {
      await syncCommerceShopifyProducts(client, state.commerceSourceId);
    } catch (syncError) {
      console.error("Post-connect Shopify sync error:", syncError);
    }

    const { data: pageData } = await client
      .from("business_organization_pages")
      .select(BUSINESS_ORG_PAGE_SELECT)
      .eq("id", state.businessId)
      .maybeSingle();

    const page = (pageData as unknown as BusinessOrgPageRow | null) ?? null;
    const profileUserId = page?.business_auth_user_id || page?.owner_user_id || state.userId;
    const redirectTarget = profileUserId
      ? `${appBaseUrl(req)}/profile/${profileUserId}?commerce=connected`
      : `${appBaseUrl(req)}/account/business-pages?commerce=connected`;

    return NextResponse.redirect(redirectTarget);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify callback failed";
    console.error("Shopify OAuth callback error:", message);

    try {
      const client = getServiceClientOrThrow();
      await client
        .from("commerce_sources")
        .update({ sync_status: "sync_failed", shopify_installation_status: "pending" })
        .eq("id", state.commerceSourceId);
    } catch {
      // ignore secondary failure
    }

    return NextResponse.redirect(`${appBaseUrl(req)}/account/business-pages?commerce=connect_failed`);
  }
}
