import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { OWNER_ADMIN_EMAIL } from "@/app/lib/ownerAdminAccess";
import { checkDb, RentalError } from "./portal.server";
import { RENTAL_PORTAL, type PropertyRow } from "./provider";
import { rentalEmail } from "./notifications.server";
import { annualReminderWindow, billingDate, billingDeadline, billingMoney, type BillingCase } from "./billing-lifecycle";

const portal = `https://eod-hub.com${RENTAL_PORTAL}`;
export async function queueBillingEmail(db: SupabaseClient, key: string, to: string, subject: string, message: string, link = portal) {
  checkDb((await db.from("rental_billing_emails").upsert({ message_key: key, recipient: to, subject, message, link }, { onConflict: "message_key", ignoreDuplicates: true })).error);
}
export async function drainBillingEmails(db: SupabaseClient, send = rentalEmail) {
  const { data, error } = await db.rpc("rental_claim_billing_emails", { p_limit: 25 }); checkDb(error);
  let sent = 0;
  for (const row of data ?? []) {
    try {
      if (await send(row.recipient, row.subject, row.message, row.link, `rental-billing-${row.id}`)) {
        checkDb((await db.from("rental_billing_emails").update({ sent_at: new Date().toISOString() }).eq("id", row.id)).error); sent++;
      }
    } catch { console.error("[rentals billing] email queued for retry", row.id); }
  }
  return { attempted: data?.length ?? 0, sent };
}
async function providerEmail(db: SupabaseClient, row: Pick<PropertyRow,"provider_id">) {
  const { data, error } = await db.from("rental_providers").select("email").eq("user_id", row.provider_id).single(); checkDb(error);
  if(!data)throw new RentalError("Billing provider not found.",503);
  return data.email as string;
}
const title = (row: PropertyRow) => row.published?.address || row.submitted?.address || row.draft.address || "Your property";

export async function openBillingCase(db: SupabaseClient, row: PropertyRow, input: Pick<BillingCase,"incident_key"|"kind"|"stripe_object_id"|"detail"|"subscription_id"> & { started: number }) {
  const { started, ...fields } = input;
  checkDb((await db.from("rental_billing_cases").upsert({ ...fields, property_id: row.id, provider_id: row.provider_id, opened_at: new Date(started).toISOString(), deadline: billingDeadline(started) }, { onConflict: "incident_key", ignoreDuplicates: true })).error);
  const { data: issue, error } = await db.from("rental_billing_cases").select("*").eq("incident_key", input.incident_key).single(); checkDb(error);
  if (issue.status === "resolved") return;
  if (["payment_failed","payment_stopped"].includes(issue.kind) && row.paid_until) checkDb((await db.from("rental_properties").update({grace_until:issue.deadline}).eq("id",row.id)).error);
  checkDb((await db.rpc("rental_refresh_billing_hold", { p_property: row.id })).error);
  const deadline = billingDate(issue.deadline);
  const customerMessage = `${title(row)}\n\n${issue.detail}\n\nPlease review your billing by ${deadline}. ${row.paid_until ? "Your existing listing can remain visible during its paid term and applicable seven-day grace period while this is reviewed." : "A new listing stays unpublished until its first payment succeeds."} If this remains unresolved at the deadline, the listing will pause and future billing will stop. Your property details will be saved. For a refund or dispute, contact hello@eod-hub.com so we can review the situation.`;
  await queueBillingEmail(db, `${issue.incident_key}:customer`, await providerEmail(db,row), "Listing billing needs attention", customerMessage);
  await queueBillingEmail(db, `${issue.incident_key}:admin`, OWNER_ADMIN_EMAIL, "Billing review required", `${title(row)}\n${issue.kind}: ${issue.detail}\nReview deadline: ${deadline}\nStripe reference: ${issue.stripe_object_id}\nReview in Admin → Rentals → Billing.`, "https://eod-hub.com/admin");
}
export async function resolveBillingCases(db: SupabaseClient, propertyId: string, kinds: BillingCase["kind"][], note: string) {
  checkDb((await db.from("rental_billing_cases").update({ status: "resolved", resolved_at: new Date().toISOString(), note }).eq("property_id",propertyId).in("kind",kinds).neq("status","resolved")).error);
  checkDb((await db.rpc("rental_refresh_billing_hold", { p_property: propertyId })).error);
}
export async function paidInvoiceEmail(db: SupabaseClient, row: PropertyRow, invoice: Stripe.Invoice) {
  if (invoice.status !== "paid" || !invoice.id) return;
  const lines = invoice.lines?.data?.map(l => `${l.description || "Listing service"}: ${billingMoney(l.amount, invoice.currency)}`).join("\n") || "Listing and any approved advertising fees";
  await queueBillingEmail(db, `receipt:${invoice.id}`, await providerEmail(db,row), "Payment confirmation", `${title(row)}\n\nPayment received: ${billingMoney(invoice.amount_paid,invoice.currency)}\nInvoice: ${invoice.number || invoice.id}\n${lines}\n\n${row.paid_until ? `Listing paid through ${billingDate(row.paid_until)}.\n` : ""}Open the paid Stripe invoice below to view the payment record and download your invoice. You can also find invoices, update your payment method, or cancel future renewal under Manage billing in your property portal.`, invoice.hosted_invoice_url || portal);
}
export async function renewalChoiceEmail(db: SupabaseClient, row: PropertyRow, subscription: Stripe.Subscription) {
  if (!row.paid_until) return;
  const key = `renewal-choice:${subscription.id}:${subscription.cancel_at_period_end}:${subscription.cancel_at ?? "on"}`;
  await queueBillingEmail(db,key,await providerEmail(db,row), subscription.cancel_at_period_end ? "Subscription cancellation confirmed" : "Automatic renewal enabled", `${title(row)}\n\n${subscription.cancel_at_period_end ? `Future renewal is off. No further renewal charge is scheduled. Your current term runs through ${billingDate(row.paid_until)}. After that, you have seven days to renew before the listing pauses.` : `Your ${row.plan} listing will renew automatically at ${billingMoney(row.plan === "annual" ? 10000 : 1000)} per property, plus applicable tax, on ${billingDate(row.paid_until)}. Cancel future renewal at any time in your property portal.`}`);
  if (subscription.cancel_at_period_end) await queueBillingEmail(db,`${key}:admin`,OWNER_ADMIN_EMAIL,"Listing renewal switched off",`${title(row)}\nPaid term ends ${billingDate(row.paid_until)}. The seven-day renewal window starts then.`,"https://eod-hub.com/admin");
}
export async function annualReminderEmail(db: SupabaseClient, row: PropertyRow, now = Date.now()) {
  if (row.plan !== "annual" || !row.paid_until || !["active","trialing"].includes(row.payment_status)) return;
  const window = annualReminderWindow(row.paid_until,now); if (!window) return;
  await queueBillingEmail(db,`annual:${row.stripe_subscription_id}:${row.paid_until}:${window}`,await providerEmail(db,row), row.auto_renew ? "Your annual listing will renew soon" : "Your annual listing term is ending", `${title(row)}\n\nYour annual term ends ${billingDate(row.paid_until)}. ${row.auto_renew ? "Automatic renewal is on. The next annual listing fee is $100 per property, plus applicable tax. Open your portal to review billing or cancel future renewal before that date." : "Automatic renewal is off. To keep your listing active, open your portal and select Enable automatic renewal before the term ends. You may also submit a new term through the cart after it ends. If you do not renew, the listing pauses after the seven-day renewal window."}`);
}

export async function expireBillingCase(db: SupabaseClient, issue: BillingCase, stripe: Stripe) {
  const {data:current,error:caseError}=await db.from("rental_billing_cases").select("status").eq("id",issue.id).single();checkDb(caseError);
  if(current?.status!=="open")return;
  const { data: row, error } = await db.from("rental_properties").select("*").eq("id",issue.property_id).single(); checkDb(error);
  // A late job must never cancel a replacement subscription.
  if (row.stripe_subscription_id === issue.subscription_id) {
    const sub = await stripe.subscriptions.retrieve(issue.subscription_id);
    if (!["canceled","incomplete_expired"].includes(sub.status)) await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
    checkDb((await db.from("rental_properties").update({ payment_status:"canceled",auto_renew:false }).eq("id",row.id).eq("stripe_subscription_id",issue.subscription_id)).error);
  }
  checkDb((await db.from("rental_billing_cases").update({status:"expired"}).eq("id",issue.id).eq("status","open")).error);
  await queueBillingEmail(db,`${issue.incident_key}:paused:customer`,await providerEmail(db,row),"Listing paused",`${title(row)}\n\nThe seven-day billing review window has ended. This listing is paused and future subscription billing has stopped. Your property details are saved. Contact hello@eod-hub.com to resolve the billing review or open the portal to submit a new listing term.`);
  await queueBillingEmail(db,`${issue.incident_key}:paused:admin`,OWNER_ADMIN_EMAIL,"Listing paused after billing review",`${title(row)}\nUnresolved ${issue.kind} reached its deadline. Review the case in Admin → Rentals → Billing.`,"https://eod-hub.com/admin");
}
