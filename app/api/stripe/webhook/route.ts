import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Required so Next.js doesn't parse the body — Stripe needs the raw bytes to verify signature
export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.arrayBuffer();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(rawBody),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  async function updateByCustomer(customerId: string, status: string) {
    await adminClient
      .from("profiles")
      .update({ subscription_status: status })
      .eq("stripe_customer_id", customerId);
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status;
      await updateByCustomer(sub.customer as string, status);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await updateByCustomer(sub.customer as string, "cancelled");
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await updateByCustomer(invoice.customer as string, "past_due");
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.parent?.type === "subscription_details") {
        await updateByCustomer(invoice.customer as string, "active");
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
