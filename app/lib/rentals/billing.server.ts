import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { RENTAL_COMMITMENT_VERSION, RENTAL_PORTAL, propertySchema, planAmount, listingHasPaidAccess, type PropertyRow, type Provider } from "./provider";
import { checkDb, RentalError } from "./portal.server";
import { rentalAdminEmail, rentalEmail } from "./notifications.server";
import { rentalNeedsNewTerm, billingMoney } from "./billing-lifecycle";
import { openBillingCase, resolveBillingCases, paidInvoiceEmail, renewalChoiceEmail, drainBillingEmails } from "./billing-notifications.server";

export function rentalBillingReady(env: NodeJS.ProcessEnv = process.env) {
  const key=env.STRIPE_RENTALS_SECRET_KEY || env.STRIPE_SECRET_KEY || "";
  const webhook=env.STRIPE_RENTALS_SECRET_KEY ? env.STRIPE_RENTALS_WEBHOOK_SECRET : env.STRIPE_WEBHOOK_SECRET;
  return !!key && !!webhook && (key.includes("_live_") || (key.includes("_test_") && (env.NODE_ENV!=="production" || env.VERCEL_ENV==="preview")));
}
export const rentalStripe = () => {
  if (!rentalBillingReady()) throw new RentalError("Listing checkout is not open yet. Your drafts are saved. Contact hello@eod-hub.com for an update.", 503);
  return new Stripe((process.env.STRIPE_RENTALS_SECRET_KEY || process.env.STRIPE_SECRET_KEY)!);
};
/** Enable only after the owner confirms collection obligations and registrations. */
export async function rentalAutomaticTax(stripe: Stripe, env: NodeJS.ProcessEnv = process.env): Promise<Stripe.SubscriptionCreateParams.AutomaticTax | undefined> {
  if(env.STRIPE_RENTALS_AUTOMATIC_TAX!=="true")return undefined;
  const [settings,registrations]=await Promise.all([stripe.tax.settings.retrieve(),stripe.tax.registrations.list({status:"active",limit:1})]);
  if(settings.status!=="active" || !registrations.data.length)throw new RentalError("Tax collection is awaiting verified business settings and active registrations. No listing charge has been created. Contact hello@eod-hub.com.",503);
  return {enabled:true};
}
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
  // Canonical Stripe Website Advertising classification, confirmed by the owner.
  const p = existing ?? await stripe.products.create({ name: kind === "listing" ? "EOD-HUB property listing" : "EOD-HUB 30-day rental social campaign", tax_code:"txcd_10701000", metadata: { eod_rental_product: kind } }, { idempotencyKey: `eod-rental-product-v2-${kind}` });
  if(existing && (typeof existing.tax_code==="string"?existing.tax_code:existing.tax_code?.id)!=="txcd_10701000")await stripe.products.update(existing.id,{tax_code:"txcd_10701000"});
  productCache.set(kind, p.id); return p.id;
}
async function requireClearedRiskReview(db: SupabaseClient, propertyId: string) {
  const {data,error}=await db.from("rental_billing_cases").select("id").eq("property_id",propertyId).in("kind",["refund","dispute","fraud_warning"]).neq("status","resolved").limit(1);checkDb(error);
  if(data?.length)throw new RentalError("EOD-HUB must resolve this property's refund, dispute, or fraud review before a new paid term can begin. Contact hello@eod-hub.com.",409);
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
  for(const row of properties as PropertyRow[])await requireClearedRiskReview(db,row.id);
  const items = input.map(item => {
    const row = (properties as PropertyRow[]).find(p => p.id === item.id)!;
    if (row.review_status === "pending" || row.setup_order_id) throw new RentalError("A property is already being submitted. Finish or cancel its existing checkout first.");
    if (row.published && listingHasPaidAccess(row) && !rentalNeedsNewTerm(row)) throw new RentalError("Submit active listing edits from the property card; they do not require another listing payment.");
    if (row.stripe_subscription_id && !rentalNeedsNewTerm(row)) throw new RentalError("Resolve the existing subscription in Manage billing before starting a new term.");
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
    session = await stripe.checkout.sessions.create({ mode: "setup", customer, currency: "usd",
      billing_address_collection: "required", customer_update: { address: "auto" },
      integration_identifier: "eod-rentals-" + Array.from(randomUUID().replaceAll("-", "").slice(0,8),c=>String.fromCharCode(97+parseInt(c,16))).join(""),
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
  if (row.published && listingHasPaidAccess(row) && !rentalNeedsNewTerm(row)) {
    checkDb((await db.from("rental_properties").update({ published: row.submitted, review_status: "approved", review_note: null, updated_at: new Date().toISOString() }).eq("id", row.id).eq("submission_id", row.submission_id)).error);
    await rentalEmail(provider.email, "Listing changes approved", "Your approved property changes are now visible. Your existing listing plan continues without an additional listing charge.");
    return;
  }
  const stripe = stripeOverride ?? rentalStripe(), customer = await rentalCustomer(db, provider);
  await requireClearedRiskReview(db,row.id);
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
    subscription = await stripe.subscriptions.create({ customer, automatic_tax:await rentalAutomaticTax(stripe),
      items: [{ price_data: { currency: "usd", product: await product(stripe, "listing"), unit_amount: planAmount(row.plan), tax_behavior:"exclusive", recurring: { interval: row.plan === "annual" ? "year" : "month" } } }],
      ...(row.campaign_requested ? { add_invoice_items: [{ price_data: { currency: "usd", product: await product(stripe, "campaign"), unit_amount: 5000, tax_behavior:"exclusive" } }] } : {}),
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
  checkDb((await db.from("rental_subscription_history").upsert({subscription_id:subscription.id,property_id:row.id,provider_id:row.provider_id},{onConflict:"subscription_id",ignoreDuplicates:true})).error);
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
  if (["canceled","unpaid"].includes(subscription.status) && row.paid_until) {
    patch.grace_until = row.grace_until ?? new Date(Date.parse(row.paid_until) + 7 * 86400000).toISOString();
  }
  checkDb((await db.from("rental_properties").update(patch).eq("id", id)).error);
  // Recovered payments resolve only payment/term cases, never refund or dispute reviews.
  if (paid && subscription.status === "active" && !subscription.pause_collection) await resolveBillingCases(db,id,["payment_failed","payment_stopped","term_ended"],"Listing payment succeeded and collection is active.");
  return true;
}

export async function handleRentalStripeEvent(db: SupabaseClient, event: Stripe.Event, stripeOverride?: Stripe) {
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
    const stripe = stripeOverride ?? rentalStripe();
    const latest = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    await syncRentalSubscription(db, latest, stripe);
    const {data: row,error}=await db.from("rental_properties").select("*").eq("stripe_subscription_id",latest.id).maybeSingle(); checkDb(error);
    if (row) {
      if(latest.pause_collection || latest.status==="paused")await openBillingCase(db,row,{incident_key:`stopped:${latest.id}:${latest.pause_collection?.resumes_at??(typeof latest.latest_invoice==="string"?latest.latest_invoice:latest.latest_invoice?.id)??"paused"}`,kind:"payment_stopped",stripe_object_id:latest.id,subscription_id:latest.id,detail:"Payment collection for your listing has been paused. Contact EOD-HUB to review the subscription and resume collection.",started:event.created*1000});
      if (latest.status === "active" && latest.latest_invoice && typeof latest.latest_invoice !== "string") await paidInvoiceEmail(db,row,latest.latest_invoice);
      const changed = (event.data.previous_attributes as {cancel_at_period_end?:boolean}|undefined)?.cancel_at_period_end !== undefined;
      if (changed && latest.status !== "canceled") await renewalChoiceEmail(db,row,latest);
      if (["canceled","unpaid"].includes(latest.status) && row.paid_until) {
        const cases=await db.from("rental_billing_cases").select("id").eq("property_id",row.id).neq("status","resolved").limit(1);checkDb(cases.error);
        if(!cases.data?.length)await openBillingCase(db,row,{incident_key:`term:${latest.id}:${row.paid_until}`,kind:"term_ended",stripe_object_id:latest.id,subscription_id:latest.id,detail:"Your paid listing term has ended or the subscription has stopped. Open your portal to review or renew.",started:Math.max(Date.parse(row.paid_until),latest.canceled_at ? latest.canceled_at*1000 : event.created*1000)});
      }
    }
    await drainBillingEmails(db); return true;
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
    const stripe = stripeOverride ?? rentalStripe();
    const sub = await stripe.subscriptions.retrieve(id, { expand: ["latest_invoice"] });
    if (sub.metadata?.billing_subject !== "eod_rental_property") return false;
    await syncRentalSubscription(db, sub, stripe);
    const { data: row,error }=await db.from("rental_properties").select("*").eq("stripe_subscription_id",sub.id).maybeSingle(); checkDb(error);
    if (!row) return true;
    const currentInvoice = await stripe.invoices.retrieve(invoice.id);
    if (currentInvoice.status === "paid") await paidInvoiceEmail(db,row,currentInvoice);
    if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
      if (currentInvoice.status === "open" && ["past_due","incomplete","unpaid"].includes(sub.status)) {
        await openBillingCase(db,row,{incident_key:`invoice:${invoice.id}`,kind:"payment_failed",stripe_object_id:invoice.id,subscription_id:sub.id,detail:"Your listing payment failed or needs bank verification. Update your payment method in Manage billing, then use Complete payment to settle the invoice.",started:event.created*1000});
      }
    }
    await drainBillingEmails(db);
    return true;
  }
  if (event.type === "customer.updated") {
    const customer = event.data.object as Stripe.Customer;
    const {data:provider,error}=await db.from("rental_providers").select("user_id").eq("stripe_customer_id",customer.id).maybeSingle();checkDb(error);
    if (!provider || !(event.data.previous_attributes as Partial<Stripe.Customer>|undefined)?.invoice_settings) return false;
    const stripe=stripeOverride??rentalStripe(), latest=await stripe.customers.retrieve(customer.id);
    if (latest.deleted) return true;
    const method=typeof latest.invoice_settings.default_payment_method==="string"?latest.invoice_settings.default_payment_method:latest.invoice_settings.default_payment_method?.id;
    if (!method) return true;
    const {data:rows,error:rowsError}=await db.from("rental_properties").select("stripe_subscription_id").eq("provider_id",provider.user_id).in("payment_status",["active","past_due","incomplete"]);checkDb(rowsError);
    for(const row of rows??[])if(row.stripe_subscription_id){
      const sub=await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if(sub.customer===customer.id && sub.metadata.billing_subject==="eod_rental_property" && sub.default_payment_method!==method) await stripe.subscriptions.update(sub.id,{default_payment_method:method});
    }
    return true;
  }
  if (["charge.refunded","charge.dispute.created","charge.dispute.closed","radar.early_fraud_warning.created"].includes(event.type)) {
    const stripe=stripeOverride??rentalStripe();
    const object=event.data.object as Stripe.Charge|Stripe.Dispute|Stripe.Radar.EarlyFraudWarning;
    const source=object.payment_intent;
    const intent=typeof source==="string"?source:source?.id;
    if(!intent) return false;
    // InvoicePayments bridges the PaymentIntent to its first-class subscription.
    for await (const payment of stripe.invoicePayments.list({payment:{type:"payment_intent",payment_intent:intent},limit:100})) {
      const invoice=typeof payment.invoice==="string"?await stripe.invoices.retrieve(payment.invoice):payment.invoice;
      if(!("parent" in invoice))continue;
      const sourceSub=invoice.parent?.subscription_details?.subscription;
      const subscriptionId=typeof sourceSub==="string"?sourceSub:sourceSub?.id;
      if(!subscriptionId)continue;
      const {data:history,error:historyError}=await db.from("rental_subscription_history").select("property_id").eq("subscription_id",subscriptionId).maybeSingle();checkDb(historyError);
      const query=db.from("rental_properties").select("*");
      const {data:row,error}=history?await query.eq("id",history.property_id).maybeSingle():await query.eq("stripe_subscription_id",subscriptionId).maybeSingle();checkDb(error);
      if(!row)continue;
      const kind=event.type==="charge.refunded"?"refund":event.type.startsWith("charge.dispute.")?"dispute":"fraud_warning";
      const key=kind==="refund"?`${kind}:${object.id}:${(object as Stripe.Charge).amount_refunded}`:`${kind}:${object.id}`;
      if(event.type==="charge.dispute.closed"&&(object as Stripe.Dispute).status==="won"){
        checkDb((await db.from("rental_billing_cases").upsert({incident_key:key,property_id:row.id,provider_id:row.provider_id,subscription_id:row.stripe_subscription_id||subscriptionId,kind:"dispute",status:"resolved",opened_at:new Date(object.created*1000).toISOString(),deadline:new Date((object.created+7*86400)*1000).toISOString(),stripe_object_id:object.id,detail:"Stripe dispute won."},{onConflict:"incident_key",ignoreDuplicates:true})).error);
        checkDb((await db.from("rental_billing_cases").update({status:"resolved",resolved_at:new Date().toISOString(),note:"Stripe dispute won."}).eq("incident_key",key)).error);
        checkDb((await db.rpc("rental_refresh_billing_hold",{p_property:row.id})).error);
      }else{
        const amount=kind==="refund"?billingMoney((object as Stripe.Charge).amount_refunded,(object as Stripe.Charge).currency):kind==="dispute"?billingMoney((object as Stripe.Dispute).amount,(object as Stripe.Dispute).currency):"";
        await openBillingCase(db,row,{incident_key:key,kind,stripe_object_id:object.id,subscription_id:row.stripe_subscription_id||subscriptionId,detail:kind==="refund"?`Stripe reports a refund of ${amount}. EOD-HUB will review the effect on your listing and any advertising service.`:kind==="dispute"?`Stripe reports a payment dispute for ${amount}. Please contact EOD-HUB to resolve this billing review.`:"Stripe has reported a possible fraudulent payment. Please contact EOD-HUB to review your billing.",started:event.created*1000});
      }
      await drainBillingEmails(db);return true;
    }
    return false;
  }
  return false;
}
