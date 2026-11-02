import { type NextRequest } from "next/server";
import { z } from "zod";
import { HUB_SUPPORT_PURPOSE, isSupportAmount } from "@/app/lib/hubSupport";
import { supportDb, supportGuard, supportJson, supportReturnOrigin, supportSource, supportStripe } from "@/app/lib/server/hubSupport";
import { readLimitedBody } from "@/app/lib/server/promotionRequests";
import { monthlySupportReady, type SupportFrequency } from "@/app/lib/hubSupportMonthly";
import type Stripe from "stripe";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const denied = supportGuard(request, true);
  if (denied) return denied;
  let input: { amountCents: number; requestId: string; frequency: SupportFrequency };
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
    input = z.object({ amountCents: z.number().refine(isSupportAmount), requestId: z.uuid(), frequency: z.enum(["one_time", "monthly"]).default("one_time") }).strict().parse(JSON.parse((await readLimitedBody(request, 1024)).toString("utf8")));
  } catch { return supportJson({ error: "Choose a contribution from $1 to $500 USD." }, 400); }
  try {
    const { stripe, live } = supportStripe();
    if (!process.env.STRIPE_SUPPORT_WEBHOOK_SECRET) throw new Error("Support webhook is not configured");
    const monthly = input.frequency === "monthly";
    if (monthly && !monthlySupportReady()) return supportJson({ error: "Monthly support is not available yet. Please choose one-time support." }, 503);
    const origin = supportReturnOrigin(request);
    const db = supportDb();
    const { data: reserved, error } = await db.rpc("reserve_hub_support_v2", { p_id: input.requestId, p_amount: input.amountCents, p_live: live, p_source: supportSource(request), p_frequency: input.frequency, p_product: monthly ? process.env.STRIPE_SUPPORT_MONTHLY_PRODUCT_ID : null });
    if (error || !reserved) throw new Error("Could not reserve contribution");
    if (reserved.error === "rate_limit") return supportJson({ error: "Too many checkout attempts. Please try again in an hour." }, 429);
    if (reserved.error || reserved.status !== "pending") return supportJson({ error: "That checkout has finished or expired. Close this dialog and start again." }, 409);
    const metadata = { purpose: HUB_SUPPORT_PURPOSE, contribution_id: reserved.id, frequency: input.frequency };
    let product: string | undefined;
    if (monthly) {
      const subscription = await db.from("hub_support_subscriptions").select("stripe_product_id").eq("id", reserved.id).single();
      if (subscription.error || !subscription.data?.stripe_product_id) throw new Error("Missing support product");
      product = subscription.data.stripe_product_id;
    }
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: monthly ? "subscription" : "payment", payment_method_types: ["card"], client_reference_id: reserved.id,
      // Stable across retries and Lambda instances, with an eight-letter suffix.
      integration_identifier: `eodhub_support_${monthly ? "monthly" : "once"}_${Array.from(createHash("sha256").update(reserved.id).digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join("")}`,
      name_collection: { individual: { enabled: true, optional: true } },
      line_items: [{ price_data: { currency: "usd", unit_amount: input.amountCents,
        ...(monthly ? { product, recurring: { interval: "month" as const } } : { product_data: { name: "Support the Hub", description: "Voluntary, one-time contribution to EOD-HUB LLC. No goods, services, or additional access. Not a charitable donation." } }) }, quantity: 1 }],
      metadata,
      ...(monthly ? { subscription_data: { metadata: { purpose: HUB_SUPPORT_PURPOSE, support_subscription_id: reserved.id } } } : { payment_intent_data: { metadata } }),
      success_url: `${origin}/support-the-hub/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/support-the-hub?cancelled=1`,
      custom_text: { submit: { message: monthly ? "Voluntary monthly support for EOD-HUB LLC. Charged today and monthly until cancelled. Cancel future renewals through the emailed Manage monthly support link. No goods, services, or additional access. Not a charitable donation." : "One-time voluntary support for EOD-HUB LLC. Not a subscription or tax-deductible charitable donation. Your receipt email and optional name are shared with EOD-HUB for contribution records." } },
    };
    const session = reserved.checkout_session_id ? await stripe.checkout.sessions.retrieve(reserved.checkout_session_id) : await stripe.checkout.sessions.create(params, { idempotencyKey: `hub-support:${live ? "live" : "test"}:${reserved.id}` });
    if (session.status !== "open") return supportJson({ error: "That checkout has finished or expired. Close this dialog and start again." }, 409);
    if (!session.url || session.livemode !== live || session.mode !== params.mode || session.metadata?.contribution_id !== reserved.id || session.metadata?.purpose !== HUB_SUPPORT_PURPOSE || session.amount_total !== input.amountCents) throw new Error("Invalid support checkout");
    const { error: saveError } = await db.from("hub_contributions").update({ checkout_session_id: session.id }).eq("id", reserved.id);
    if (saveError) throw new Error("Could not save support checkout");
    return supportJson({ url: session.url });
  } catch (error) {
    console.error("[hub-support] checkout unavailable", error instanceof Error ? error.name : "Error");
    return supportJson({ error: "Contributions are not available just yet. Please try again later. You have not been charged." }, 503);
  }
}
