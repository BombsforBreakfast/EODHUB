import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HUB_SUPPORT_PURPOSE, supportDollars } from "../hubSupport";
import { validMonthlyItem, type SupportSubscription } from "../hubSupportMonthly";
import { OWNER_ADMIN_EMAIL } from "../ownerAdminAccess";
import { supportEmailHash } from "./hubSupportManagement";
import { queueSupportEmail } from "./hubSupportEmail";

const idOf = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;
export const supportManageUrl = () => `${process.env.HUB_SUPPORT_SITE_URL}/support-the-hub/manage`;
type Context = { db: SupabaseClient; stripe: Stripe; live: boolean };
type Notice = { notification_id?: string; message?: string } | null;

/** Stripe IDs are authoritative. Metadata can bind only a previously reserved,
 * validated support record when the initial invoice arrives before Checkout. */
export async function syncSupportSubscription(ctx: Context, subscriptionId: string, eventCreated = Math.floor(Date.now()/1000)) {
  const { db, stripe, live } = ctx;
  const lookup = await db.from("hub_support_subscriptions").select("*").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (lookup.error) throw Error("Support lookup failed");
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  let row = lookup.data as SupportSubscription | null;
  if (!row) {
    const id = subscription.metadata.support_subscription_id;
    if (subscription.metadata.purpose !== HUB_SUPPORT_PURPOSE || !z.uuid().safeParse(id).success) return null;
    const reserved = await db.from("hub_support_subscriptions").select("*").eq("id", id).maybeSingle();
    if (reserved.error) throw Error("Support reservation lookup failed");
    row = reserved.data;
    if (!row) throw Error("Missing support reservation");
  }
  const customerId = idOf(subscription.customer);
  if (row.livemode !== live || subscription.livemode !== live || !customerId ||
    (row.stripe_subscription_id && row.stripe_subscription_id !== subscription.id) ||
    (row.stripe_customer_id && row.stripe_customer_id !== customerId) ||
    !validMonthlyItem(subscription.items.data, row.stripe_product_id, row.amount_cents)) throw Error("Support subscription ownership mismatch");
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.livemode !== live) throw Error("Support customer unavailable");
  const emailHash = customer.email ? supportEmailHash(customer.email) : null;
  const periodEnd = subscription.items.data[0].current_period_end;
  const { data, error } = await db.rpc("sync_hub_support_subscription", {
    p_id: row.id, p_live: live, p_subscription: subscription.id, p_customer: customerId,
    p_email_hash: emailHash, p_status: subscription.status,
    p_period_end: periodEnd ? new Date(periodEnd*1000).toISOString() : null,
    p_cancel: subscription.cancel_at_period_end, p_event_created: eventCreated,
  });
  if (error) throw Error("Could not sync support subscription");
  return { row: data as SupportSubscription, previous: row, subscription, customer };
}

async function supportNotice(ctx: Context, key: string, subject: string, message: string, email?: string | null) {
  if (email) await queueSupportEmail(ctx.db, `${key}:customer`, { recipient: email, subject, message, link: supportManageUrl(), livemode: ctx.live });
  await queueSupportEmail(ctx.db, `${key}:owner`, { recipient: OWNER_ADMIN_EMAIL, subject, message: `${message}\nSupport reference: ${key}`, link: `${process.env.HUB_SUPPORT_SITE_URL}/admin/hub-support`, livemode: ctx.live });
}

async function issue(ctx: Context, row: SupportSubscription, kind: string, object: string, detail: string, resolved = false, variant = "") {
  const key = `${kind}:${object}${variant}`;
  const result = await ctx.db.from("hub_support_billing_issues").upsert({ incident_key: key, support_subscription_id: row.id,
    kind, stripe_object_id: object, detail, status: resolved ? "resolved" : "open", resolved_at: resolved ? new Date().toISOString() : null }, { onConflict: "incident_key", ignoreDuplicates: true });
  if (result.error) throw Error("Could not record support billing issue");
  if (resolved) {
    const saved = await ctx.db.from("hub_support_billing_issues").update({status: "resolved", resolved_at: new Date().toISOString()}).eq("incident_key", key);
    if (saved.error) throw Error("Could not resolve support billing issue");
  }
}

export async function recordSupportInvoice(ctx: Context, invoice: Stripe.Invoice, eventId: string, kind: "paid" | "failed" | "refund" | "dispute" | "dispute_won", eventCreated: number, refunded = 0, disputed: number | null = null) {
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  if (!subscriptionId) return null;
  const synced = await syncSupportSubscription(ctx, subscriptionId, eventCreated);
  if (!synced) return null;
  const { row, customer } = synced;
  if (invoice.livemode !== ctx.live || idOf(invoice.customer) !== row.stripe_customer_id || invoice.currency !== "usd" ||
    invoice.total !== row.amount_cents || !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason ?? "") ||
    (kind === "paid" && (invoice.status !== "paid" || invoice.amount_paid !== row.amount_cents))) throw Error("Unsupported support invoice");
  const payments = await ctx.stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 });
  const intents = payments.data.filter(p => p.payment.type === "payment_intent" && p.status === "paid").map(p => idOf(p.payment.payment_intent)).filter(Boolean);
  if (payments.has_more || intents.length > 1) throw Error("Unsupported support payment allocation");
  if (kind === "paid" && (intents.length !== 1 || payments.data.find(p => p.status === "paid")?.amount_paid !== row.amount_cents)) throw Error("Support invoice has no matching collected payment");
  const result = await ctx.db.rpc("record_hub_support_invoice", { p_event: eventId, p_id: row.id, p_live: ctx.live,
    p_invoice: invoice.id, p_intent: intents[0] ?? null, p_amount: row.amount_cents, p_first: invoice.billing_reason === "subscription_create",
    p_kind: kind, p_refunded: refunded, p_disputed: disputed,
    p_paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at*1000).toISOString() : null });
  if (result.error) throw Error("Could not record support invoice");
  if (kind === "paid") {
    const fixed = await ctx.db.from("hub_support_billing_issues").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("incident_key", `payment_failed:${invoice.id}`);
    if (fixed.error) throw Error("Could not resolve support payment issue");
    await supportNotice(ctx, `paid:${invoice.id}`, "Monthly support payment received", `Thank you! Your ${supportDollars(row.amount_cents)} monthly support payment is confirmed.\nInvoice: ${invoice.number ?? invoice.id}\nYour support renews monthly until you cancel. You can update your payment method, view invoices, or stop the next renewal through Manage monthly support. No Hub account is required.\nVoluntary business support for EOD-HUB LLC; not a charitable donation.`, customer.email);
  } else if (kind === "failed") {
    await issue(ctx, row, "payment_failed", invoice.id, "Monthly support payment failed. Stripe may retry; the supporter can update or cancel through the secure portal.");
    await supportNotice(ctx, `failed:${invoice.id}`, "Monthly support payment needs attention", `We could not collect your ${supportDollars(row.amount_cents)} monthly support payment. Stripe may retry the payment. Use Manage monthly support to update your payment method or cancel. Your EOD-HUB access is unchanged.`, customer.email);
  }
  return { synced, contribution: result.data.contribution, notice: result.data.notification as Notice };
}

/** Also called by reconciliation so a delayed webhook cannot lose a notice. */
export async function notifySupportState(ctx: Context, synced: NonNullable<Awaited<ReturnType<typeof syncSupportSubscription>>>) {
    const { row, previous, customer } = synced;
    if (row.status === "canceled" || row.cancel_at_period_end || previous.cancel_at_period_end !== row.cancel_at_period_end) {
      const stopped = row.status === "canceled" || row.cancel_at_period_end;
      await supportNotice(ctx, `subscription:${row.stripe_subscription_id}:${row.status}:${row.cancel_at_period_end}:${row.current_period_end}`, stopped ? "Monthly support cancellation confirmed" : "Monthly support renewal resumed",
        stopped ? `Your monthly support is ${row.status === "canceled" ? "cancelled" : "set to end after the current billing period"}. No further renewal will be charged${row.current_period_end ? ` after ${new Date(row.current_period_end).toLocaleDateString("en-US", { timeZone: "UTC" })}` : ""}. Thank you for supporting EOD-HUB. Cancellation stops future renewals; contact hello@eod-hub.com about an existing charge.` : "Your monthly support will renew again. Manage or cancel any time through the secure Support portal.", customer.email);
    }
}
export async function handleMonthlySupportEvent(ctx: Context, event: Stripe.Event): Promise<{ handled: boolean; notice?: Notice }> {
  const object = event.data.object;
  if (event.type.startsWith("customer.subscription.")) {
    const synced = await syncSupportSubscription(ctx, (object as Stripe.Subscription).id, event.created);
    if (!synced) return { handled: false };
    await notifySupportState(ctx, synced);
    return { handled: true };
  }
  if (event.type === "customer.updated") {
    const customer = object as Stripe.Customer;
    const lookup = await ctx.db.from("hub_support_subscriptions").select("stripe_subscription_id").eq("stripe_customer_id", customer.id).eq("livemode", ctx.live).maybeSingle();
    if (lookup.error) throw Error("Support customer lookup failed");
    if (!lookup.data?.stripe_subscription_id) return { handled: false };
    await syncSupportSubscription(ctx, lookup.data.stripe_subscription_id, event.created);
    return { handled: true };
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const current = await ctx.stripe.invoices.retrieve((object as Stripe.Invoice).id);
    // A late failed event after recovery records the current paid state instead.
    const result = await recordSupportInvoice(ctx, current, event.id, current.status === "paid" ? "paid" : "failed", event.created);
    return { handled: !!result, notice: result?.notice };
  }
  if (event.type.startsWith("checkout.session.")) {
    const session = object as Stripe.Checkout.Session;
    if (session.mode !== "subscription" || session.metadata?.purpose !== HUB_SUPPORT_PURPOSE) return { handled: false };
    const subscriptionId = idOf(session.subscription);
    if (subscriptionId) await syncSupportSubscription(ctx, subscriptionId, event.created);
    else if (event.type === "checkout.session.expired" && z.uuid().safeParse(session.metadata.contribution_id).success) {
      const result = await ctx.db.from("hub_contributions").update({ status: "expired" }).eq("id", session.metadata.contribution_id).eq("frequency", "monthly").eq("status", "pending").eq("checkout_session_id", session.id);
      if (result.error) throw Error("Could not expire support checkout");
    }
    return { handled: true };
  }
  const risk = ["charge.refunded", "charge.dispute.created", "charge.dispute.closed", "radar.early_fraud_warning.created"].includes(event.type);
  if (!risk) return { handled: false };
  const data = object as Stripe.Charge | Stripe.Dispute | Stripe.Radar.EarlyFraudWarning;
  if (event.type === "charge.refunded") {
    const intent = idOf((object as Stripe.Charge).payment_intent);
    if (intent) {
      const known = await ctx.db.from("hub_contributions").select("frequency").eq("payment_intent_id", intent).maybeSingle();
      if (known.error) throw Error("Support refund lookup failed");
      if (known.data?.frequency === "one_time") return { handled: false };
    }
  }
  const chargeId = event.type === "charge.refunded" ? data.id : idOf((data as Stripe.Dispute).charge);
  if (!chargeId) return { handled: false };
  const charge = await ctx.stripe.charges.retrieve(chargeId);
  const intentId = idOf(charge.payment_intent);
  if (!intentId) return { handled: false };
  // Graph lookup supports out-of-order refund/dispute delivery before invoice.paid.
  for await (const payment of ctx.stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intentId }, limit: 100 })) {
    const invoice = await ctx.stripe.invoices.retrieve(idOf(payment.invoice)!);
    const subId = idOf(invoice.parent?.subscription_details?.subscription);
    if (!subId) continue;
    const synced = await syncSupportSubscription(ctx, subId, event.created);
    if (!synced) continue;
    const kind = event.type === "charge.refunded" ? "refund" : event.type.startsWith("charge.dispute.") ? "dispute" : "fraud_warning";
    let notice: Notice = null;
    if (kind !== "fraud_warning") {
      const won = event.type === "charge.dispute.closed" && (data as Stripe.Dispute).status === "won";
      const result = await recordSupportInvoice(ctx, invoice, event.id, kind === "refund" ? "refund" : won ? "dispute_won" : "dispute", event.created, charge.amount_refunded, kind === "dispute" ? Math.min(charge.amount, (data as Stripe.Dispute).amount) : null);
      notice = result?.notice ?? null;
    }
    const resolved = event.type === "charge.dispute.closed";
    await issue(ctx, synced.row, kind, kind === "refund" ? charge.id : data.id, `${event.type}: ${kind === "refund" ? supportDollars(charge.amount_refunded) : "Review in Stripe"}.`, resolved, kind === "refund" ? `:${charge.amount_refunded}` : "");
    await supportNotice(ctx, `${event.type}:${data.id}:${kind === "refund" ? charge.amount_refunded : ""}`, `Support billing: ${kind.replaceAll("_", " ")}`, `${event.type} was recorded for monthly support ${synced.row.stripe_subscription_id}. Review the payment in Stripe. No automatic refund or subscription cancellation was performed.`);
    return { handled: true, notice };
  }
  return { handled: false };
}
