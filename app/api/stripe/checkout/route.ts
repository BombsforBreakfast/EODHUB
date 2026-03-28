import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await adminClient
    .from("profiles")
    .select("stripe_customer_id, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();

  // Reuse existing Stripe customer or create a new one
  let customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(user.id);
    const customer = await stripe.customers.create({
      email: authUser?.user?.email ?? undefined,
      name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await adminClient.from("profiles").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
  }

  const origin = req.headers.get("origin") ?? "https://eod-hub.com";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    subscription_data: { trial_period_days: 10 },
    success_url: `${origin}/?subscribed=1`,
    cancel_url: `${origin}/subscribe?cancelled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
