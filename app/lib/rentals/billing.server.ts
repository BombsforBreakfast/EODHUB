import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { RENTAL_COMMITMENT_VERSION, RENTAL_PORTAL, propertySchema, planAmount, listingHasPaidAccess, type PropertyRow, type Provider } from "./provider";
import { checkDb, RentalError } from "./portal.server";
import { rentalAdminEmail, rentalEmail } from "./notifications.server";

export function rentalBillingReady(env: NodeJS.ProcessEnv = process.env) {
  const key=env.STRIPE_RENTALS_SECRET_KEY || env.STRIPE_SECRET_KEY || "";
  const webhook=env.STRIPE_RENTALS_SECRET_KEY ? env.STRIPE_RENTALS_WEBHOOK_SECRET : env.STRIPE_WEBHOOK_SECRET;
  return !!key && !!webhook && (key.includes("_live_") || (key.includes("_test_") && (env.NODE_ENV!=="production" || env.VERCEL_ENV==="preview")));
}
export const rentalStripe = () => {
  if (!rentalBillingReady()) throw new RentalError("Listing checkout is not open yet. Your drafts are saved. Contact hello@eod-hub.com for an update.", 503);
  return new Stripe((process.env.STRIPE_RENTALS_SECRET_KEY || process.env.STRIPE_SECRET_KEY)!);
};
const productCache = new Map<string, string>();
let portalConfiguration: string | undefined;
export async function rentalBillingPortal(customer: string, stripeOverride?: Stripe, origin = "https://eod-hub.com") {
  const stripe = stripeOverride ?? rentalStripe();
  if (!portalConfiguration) {
    const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    const existing = configurations.data.find(c => c.metadata?.eod_rental_portal === "v1");
    const configuration = existing ?? await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Manage your EOD-HUB Rentals billing", privacy_policy_url: "https://eod-hub.com/privacy", terms_of_service_url: "https://eod-hub.com/promote/rentals/terms" },
      default_return_url: `https://eod-hub.com${RENTAL_PORTAL}`,
      features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_cancel: { enabled: true, mode: "at_period_end" }, subscription_update: { enabled: false } },
      metadata: { eod_rental_portal: "v1" },
    }, { idempotencyKey: "eod-rental-billing-portal-v1" });
    portalConfiguration = configuration.id;
  }
  return stripe.billingPortal.sessions.create({ customer, configuration: portalConfiguration, return_url: `${origin}${RENTAL_PORTAL}` });
}
async function product(stripe: Stripe, kind: "listing" | "campaign") {
  if (productCache.has(kind)) return productCache.get(kind)!;
  const existing = (await stripe.products.list({ active: true, limit: 100 })).data.find(p => p.metadata.eod_rental_product === kind);
  const p = existing ?? await stripe.products.create({ name: kind === "listing" ? "EOD-HUB property listing" : "EOD-HUB 30-day rental social campaign", metadata: { eod_rental_product: kind } }, { idempotencyKey: `eod-rental-product-v1-${kind}` });
  productCache.set(kind, p.id); return p.id;
}
export async function rentalCustomer(db: SupabaseClient, provider: Provider) {
  if (provider.stripe_customer_id) return provider.stripe_customer_id;
  const customer = await rentalStripe().customers.create({ email: provider.email, name: provider.company || provider.full_name, metadata: { billing_subject: "eod_rental_provider", rental_provider_id: provider.user_id } }, { idempotencyKey: `rental-customer-${provider.user_id}` });
  checkDb((await db.from("rental_providers").update({ stripe_customer_id: customer.id }).eq("user_id", provider.user_id)).error);
  return customer.id;
}
export async function startRentalOrder(db: SupabaseClient, provider: Provider, input: { id: string; plan: "monthly" | "annual"; autoRenew: boolean; campaign: boolean }[], origin: string) {
  if (!input.length || input.length > 50 || new Set(input.map(i => i.id)).size !== input.length) throw new RentalError("Select 1–50 different properties.");
  const { data: properties, error } = await db.from("rental_properties").select("*").eq("provider_id", provider.user_id).in("id", input.map(i => i.id));
  checkDb(error);
  if (properties?.length !== input.length) throw new RentalError("One of these properties is not in your account.", 403);
  const items = input.map(item => {
    const row = (properties as PropertyRow[]).find(p => p.id === item.id)!;
    if (row.review_status === "pending" || row.setup_order_id) throw new RentalError("A property is already being submitted. Finish or cancel its existing checkout first.");
    if (row.published && listingHasPaidAccess(row)) throw new RentalError("Submit active listing edits from the property card; they do not require another listing payment.");
    const payload = propertySchema.parse(row.draft);
    if (payload.photos.some(p => !p.startsWith(`${provider.user_id}/photos/`))) throw new RentalError("Use photos uploaded by your account.", 403);
    return { ...item, revision: row.revision, submissionId: randomUUID(), payload };
  });
  const customer = await rentalCustomer(db, provider), stripe = rentalStripe();
  const { data: order, error: orderError } = await db.from("rental_orders").insert({ provider_id: provider.user_id, items, consent_version: RENTAL_COMMITMENT_VERSION }).select("id").single();
  checkDb(orderError);
  if (!order) throw new RentalError("Could not create your cart.", 503);
  let session: Stripe.Checkout.Session | undefined;
  try {
    for (const item of items) {
      const locked = await db.from("rental_properties").update({ setup_order_id: order.id }).eq("id", item.id).eq("provider_id", provider.user_id).eq("revision", item.revision).is("setup_order_id", null).neq("review_status", "pending").select("id");
      checkDb(locked.error);
      if (locked.data?.length !== 1) throw new RentalError("A property changed. Refresh your cart and retry.", 409);
    }
    session = await stripe.checkout.sessions.create({ mode: "setup", customer, payment_method_types: ["card"],
      metadata: { rental_order_id: order.id, billing_subject: "eod_rental_order" },
      setup_intent_data: { metadata: { rental_order_id: order.id } },
      custom_text: { submit: { message: "Your card is saved securely. Each property is charged only after EOD-HUB approves it. Renewal follows the choices in your property cart." } },
      success_url: `${origin}${RENTAL_PORTAL}?checkout={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}${RENTAL_PORTAL}?cart=canceled`,
    }, { idempotencyKey: `rental-order-${order.id}` });
    checkDb((await db.from("rental_orders").update({ stripe_session_id: session.id }).eq("id", order.id)).error);
    return session.url;
  } catch (error) {
    if (session?.status === "open") await stripe.checkout.sessions.expire(session.id).catch(() => {});
    await db.from("rental_properties").update({ setup_order_id: null }).eq("setup_order_id", order.id);
    await db.from("rental_orders").update({ status: "canceled" }).eq("id", order.id);
    throw error;
  }
}
export async function finishRentalOrder(db: SupabaseClient, session: Stripe.Checkout.Session, providerId?: string) {
  const id = session.metadata?.rental_order_id;
  if (!id || session.metadata?.billing_subject !== "eod_rental_order" || session.status !== "complete") return false;
  const { data: order } = await db.from("rental_orders").select("*").eq("id", id).maybeSingle();
  if (!order || order.stripe_session_id !== session.id || (providerId && order.provider_id !== providerId)) throw new RentalError("Checkout does not belong to your account.", 403);
  const { data: provider } = await db.from("rental_providers").select("stripe_customer_id,email").eq("user_id", order.provider_id).single();
  if (!provider || provider.stripe_customer_id !== session.customer) throw new RentalError("Checkout customer mismatch.", 403);
  const intent = typeof session.setup_intent === "string" ? await rentalStripe().setupIntents.retrieve(session.setup_intent) : session.setup_intent;
  const method = typeof intent?.payment_method === "string" ? intent.payment_method : intent?.payment_method?.id;
  if (intent?.status !== "succeeded" || !method) throw new RentalError("Complete payment-method setup first.");
  const { data: count, error } = await db.rpc("rental_submit_order", { p_id: id, p_payment_method: method }); checkDb(error);
  if (count) {
    await rentalAdminEmail("Properties ready for review", `${count} rental ${count === 1 ? "property is" : "properties are"} ready for approval in Admin → Rentals. No listing fees have been charged yet.`);
    await rentalEmail(provider.email, "Properties submitted", "Your properties have been submitted for review. Only approved properties will be charged and published.");
  }
  return true;
}

export async function approveRentalProperty(db: SupabaseClient, row: PropertyRow, provider: Provider, stripeOverride?: Stripe) {
  if (!row.submitted || !row.submission_id || provider.status !== "approved") throw new RentalError("This property is not ready for approval.");
  propertySchema.parse(row.submitted);
  if (row.published && listingHasPaidAccess(row)) {
    checkDb((await db.from("rental_properties").update({ published: row.submitted, review_status: "approved", review_note: null, updated_at: new Date().toISOString() }).eq("id", row.id).eq("submission_id", row.submission_id)).error);
    await rentalEmail(provider.email, "Listing changes approved", "Your approved property changes are now visible. Your existing listing plan continues without an additional listing charge.");
    return;
  }
  const stripe = stripeOverride ?? rentalStripe(), customer = await rentalCustomer(db, provider);
  if (!row.payment_method_id) throw new RentalError("This submission has no authorized payment method.");
  let subscription: Stripe.Subscription | undefined;
  // Also recover a prior successful API call whose database write was interrupted.
  let after: string | undefined;
  do {
    const page = await stripe.subscriptions.list({ customer, status: "all", limit: 100, ...(after ? { starting_after: after } : {}) });
    subscription = page.data.find(s => s.metadata.rental_property_id === row.id && s.metadata.rental_submission_id === row.submission_id);
    after = !subscription && page.has_more ? page.data.at(-1)?.id : undefined;
  } while (after);
  if (!subscription) {
    if (row.stripe_subscription_id) {
      const previous = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if (!["canceled", "incomplete_expired", "unpaid"].includes(previous.status)) throw new RentalError("Resolve the existing listing subscription before starting a new term.");
    }
    subscription = await stripe.subscriptions.create({ customer,
      items: [{ price_data: { currency: "usd", product: await product(stripe, "listing"), unit_amount: planAmount(row.plan), recurring: { interval: row.plan === "annual" ? "year" : "month" } } }],
      ...(row.campaign_requested ? { add_invoice_items: [{ price_data: { currency: "usd", product: await product(stripe, "campaign"), unit_amount: 5000 } }] } : {}),
      default_payment_method: row.payment_method_id, collection_method: "charge_automatically", payment_behavior: "allow_incomplete", off_session: true,
      cancel_at_period_end: !row.auto_renew,
      metadata: { billing_subject: "eod_rental_property", rental_property_id: row.id, rental_provider_id: provider.user_id, rental_submission_id: row.submission_id, rental_campaign_requested: row.campaign_requested ? "true" : "false" },
      expand: ["latest_invoice"],
    }, { idempotencyKey: `rental-approval-${row.id}-${row.submission_id}` });
  }
  checkDb((await db.from("rental_properties").update({ stripe_subscription_id: subscription.id, billing_submission_id: row.submission_id, review_status: "approved" }).eq("id", row.id).eq("submission_id", row.submission_id)).error);
  if (row.campaign_requested) checkDb((await db.from("rental_campaigns").upsert({ property_id: row.id, provider_id: row.provider_id, submission_id: row.submission_id }, { onConflict: "submission_id", ignoreDuplicates: true })).error);
  await syncRentalSubscription(db, subscription, stripe);
  await rentalEmail(provider.email, "Property approved", "Your property has been approved. It publishes after the approved listing payment succeeds. If your bank requires another step, open your portal to complete payment.");
}

export async function syncRentalSubscription(db: SupabaseClient, subscription: Stripe.Subscription, stripeOverride?: Stripe) {
  const id = subscription.metadata.rental_property_id;
  if (!id || subscription.metadata.billing_subject !== "eod_rental_property") return false;
  const { data: row } = await db.from("rental_properties").select("*").eq("id", id).maybeSingle();
  if (!row || (row.stripe_subscription_id && row.stripe_subscription_id !== subscription.id)) return true;
  if (!row.stripe_subscription_id && row.submission_id !== subscription.metadata.rental_submission_id) return true;
  const invoice = typeof subscription.latest_invoice === "string" ? await (stripeOverride ?? rentalStripe()).invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
  const paid = invoice?.status === "paid", end = subscription.items.data[0]?.current_period_end;
  if (subscription.metadata.rental_campaign_requested === "true") {
    checkDb((await db.from("rental_campaigns").upsert({ property_id: row.id, provider_id: row.provider_id, submission_id: subscription.metadata.rental_submission_id }, { onConflict: "submission_id", ignoreDuplicates: true })).error);
  }
  const patch: Record<string, unknown> = { stripe_subscription_id: subscription.id, billing_submission_id: subscription.metadata.rental_submission_id, auto_renew: !subscription.cancel_at_period_end && subscription.status !== "canceled", payment_status: subscription.status, payment_url: invoice?.hosted_invoice_url ?? null, updated_at: new Date().toISOString() };
  if (paid && end) {
    patch.paid_until = new Date(end * 1000).toISOString(); patch.grace_until = null;
    if (row.review_status === "approved" && row.submitted && row.submission_id === subscription.metadata.rental_submission_id) patch.published = row.submitted;
    checkDb((await db.from("rental_campaigns").update({ paid: true, status: "queued" }).eq("submission_id", subscription.metadata.rental_submission_id).eq("status", "awaiting_payment")).error);
  } else if (subscription.status === "past_due" && row.paid_until) {
    patch.grace_until = row.grace_until ?? new Date(Date.parse(row.paid_until) + 7 * 86400000).toISOString();
  }
  checkDb((await db.from("rental_properties").update(patch).eq("id", id)).error);
  return true;
}

export async function handleRentalStripeEvent(db: SupabaseClient, event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.billing_subject !== "eod_rental_order") return false;
    await finishRentalOrder(db, session); return true;
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.billing_subject !== "eod_rental_order") return false;
    const { data: order } = await db.from("rental_orders").select("id").eq("stripe_session_id", session.id).eq("status", "setup_pending").maybeSingle();
    if (order) { checkDb((await db.from("rental_properties").update({ setup_order_id: null }).eq("setup_order_id", order.id)).error); checkDb((await db.from("rental_orders").update({ status: "canceled" }).eq("id", order.id)).error); }
    return true;
  }
  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.metadata?.billing_subject !== "eod_rental_property") return false;
    return syncRentalSubscription(db, await rentalStripe().subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] }));
  }
  if (["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
    const invoice = event.data.object as Stripe.Invoice;
    const source = invoice.parent?.subscription_details?.subscription;
    const id = typeof source === "string" ? source : source?.id;
    if (!id) return false;
    const rentalHint = invoice.parent?.subscription_details?.metadata?.billing_subject === "eod_rental_property";
    if (!rentalHint) {
      const { data: rental } = await db.from("rental_properties").select("id").eq("stripe_subscription_id", id).maybeSingle();
      if (!rental) return false;
    }
    const sub = await rentalStripe().subscriptions.retrieve(id, { expand: ["latest_invoice"] });
    if (sub.metadata?.billing_subject !== "eod_rental_property") return false;
    await syncRentalSubscription(db, sub);
    if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
      const { data: provider } = await db.from("rental_providers").select("email").eq("user_id", sub.metadata.rental_provider_id).maybeSingle();
      if (provider) await rentalEmail(provider.email, "Listing payment needs attention", "Open your property portal to update your payment method or complete your bank's verification. A new listing remains unpublished until payment succeeds.");
    }
    return true;
  }
  return false;
}
