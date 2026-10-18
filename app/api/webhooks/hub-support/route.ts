import { type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { HUB_SUPPORT_PURPOSE, isSupportAmount } from "@/app/lib/hubSupport";
import { supportDb, supportJson, supportStripe } from "@/app/lib/server/hubSupport";
import { readLimitedBody } from "@/app/lib/server/promotionRequests";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return supportJson({ error: "Missing signature" }, 400);
  let stripe: Stripe; let live: boolean; let event: Stripe.Event;
  try {
    ({ stripe, live } = supportStripe());
    const secret = process.env.STRIPE_SUPPORT_WEBHOOK_SECRET;
    if (!secret) throw new Error();
    event = stripe.webhooks.constructEvent(await readLimitedBody(request, 262144), signature, secret);
  } catch { return supportJson({ error: "Webhook verification failed" }, 400); }
  if (event.livemode !== live) return supportJson({ error: "Payment mode mismatch" }, 400);
  try {
    let id: string | undefined; let amount: number | null = null; let intent: string | null = null; let session: string | null = null; let refunded = 0;
    let kind: "paid" | "expired" | "refund";
    if (["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const checkout = event.data.object as Stripe.Checkout.Session;
      if (checkout.metadata?.purpose !== HUB_SUPPORT_PURPOSE) return supportJson({ received: true });
      if (checkout.mode !== "payment" || checkout.currency !== "usd") throw new Error("Unsupported support payment");
      kind = event.type === "checkout.session.expired" ? "expired" : "paid";
      if (kind === "paid" && checkout.payment_status !== "paid") return supportJson({ received: true });
      id = checkout.metadata.contribution_id; amount = checkout.amount_total; session = checkout.id;
      intent = typeof checkout.payment_intent === "string" ? checkout.payment_intent : checkout.payment_intent?.id ?? null;
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!intentId) return supportJson({ received: true });
      const payment = await stripe.paymentIntents.retrieve(intentId);
      if (payment.metadata.purpose !== HUB_SUPPORT_PURPOSE) return supportJson({ received: true });
      if (charge.currency !== "usd") throw new Error("Currency mismatch");
      kind = "refund"; id = payment.metadata.contribution_id; amount = charge.amount; intent = intentId; refunded = charge.amount_refunded;
    } else return supportJson({ received: true });
    if (!z.uuid().safeParse(id).success || !isSupportAmount(amount)) throw new Error("Invalid support payment");
    const { error } = await supportDb().rpc("apply_hub_support_event", { p_event: event.id, p_id: id, p_live: live, p_kind: kind, p_amount: amount, p_intent: intent, p_session: session, p_refunded: refunded });
    if (error) throw error;
    return supportJson({ received: true });
  } catch { console.error("[hub-support] payment event could not be recorded", event.id); return supportJson({ error: "Payment recording failed. Retry this event." }, 500); }
}
