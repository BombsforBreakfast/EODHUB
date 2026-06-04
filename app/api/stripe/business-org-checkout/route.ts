import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { loadBusinessOrgPageForOwner } from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { pageId?: unknown };
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) return NextResponse.json({ error: "Business page id is required." }, { status: 400 });

  const page = await loadBusinessOrgPageForOwner(client, pageId, user.id);
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });

  let customerId = page.stripe_customer_id ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? page.linked_account_email,
      name: page.business_name,
      metadata: {
        supabase_user_id: user.id,
        business_org_page_id: page.id,
        billing_subject: "business_organization_page",
      },
    });
    customerId = customer.id;
    await client
      .from("business_organization_pages")
      .update({ stripe_customer_id: customerId })
      .eq("id", page.id);
  }

  const origin = req.headers.get("origin") ?? "https://eod-hub.com";
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_BUSINESS_ORG_PRICE_ID ?? process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        business_org_page_id: page.id,
        billing_subject: "business_organization_page",
      },
    },
    metadata: {
      supabase_user_id: user.id,
      business_org_page_id: page.id,
      billing_subject: "business_organization_page",
    },
    success_url: `${origin}/account/business-pages?business_page_subscribed=1`,
    cancel_url: `${origin}/account/business-pages?business_page_cancelled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
