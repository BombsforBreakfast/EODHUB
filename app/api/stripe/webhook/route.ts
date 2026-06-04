import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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

  async function updateBusinessOrgPageBySubscription(sub: Stripe.Subscription, status: string) {
    const pageId =
      typeof sub.metadata?.business_org_page_id === "string"
        ? sub.metadata.business_org_page_id
        : null;
    if (!pageId) {
      await adminClient
        .from("business_organization_pages")
        .update({
          subscription_status: status,
          stripe_subscription_id: sub.id,
        })
        .eq("stripe_customer_id", sub.customer as string);
      return;
    }

    await adminClient
      .from("business_organization_pages")
      .update({
        subscription_status: status,
        stripe_subscription_id: sub.id,
      })
      .eq("id", pageId);
  }

  function isBusinessOrgSubscription(sub: Stripe.Subscription): boolean {
    return sub.metadata?.billing_subject === "business_organization_page"
      || typeof sub.metadata?.business_org_page_id === "string";
  }

  switch (event.type) {
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status === "active" || sub.status === "trialing" ? sub.status : sub.status;
      if (isBusinessOrgSubscription(sub)) {
        await updateBusinessOrgPageBySubscription(sub, status);
        break;
      }
      // Do not set verification_status here — access approval stays with admin (or community vouch), not payment.
      await updateByCustomer(sub.customer as string, status);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      if (isBusinessOrgSubscription(sub)) {
        await updateBusinessOrgPageBySubscription(sub, sub.status);
        break;
      }
      await updateByCustomer(sub.customer as string, sub.status);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (isBusinessOrgSubscription(sub)) {
        await updateBusinessOrgPageBySubscription(sub, "cancelled");
        break;
      }
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
