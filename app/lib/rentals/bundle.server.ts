import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { rentalStripe,rentalAutomaticTax,rentalBillingPortal } from "./billing.server";
import { checkDb,RentalError } from "./portal.server";
import { queueBillingEmail } from "./billing-notifications.server";
import { billingDate,billingMoney } from "./billing-lifecycle";
import { BUNDLE_PATH,BUNDLE_TERMS,bundleCheckoutAllowed,bundleReminder,type RentalBundle } from "./bundle";
import { OWNER_ADMIN_EMAIL } from "../ownerAdminAccess";

export async function ownerBundle(db:SupabaseClient,userId:string) {
  const result=await db.from("rental_legacy_bundles").select("*").eq("user_id",userId).maybeSingle();checkDb(result.error);
  if(!result.data)throw new RentalError("No existing-property bundle is attached to this account. Sign in using the email that received your invitation.",404);
  return result.data as RentalBundle;
}
const subscriptionId=(v:Stripe.Invoice)=>typeof v.parent?.subscription_details?.subscription==="string"?v.parent.subscription_details.subscription:v.parent?.subscription_details?.subscription?.id;
const customerId=(v:string|{id:string}|null)=>typeof v==="string"?v:v?.id;
const link=`https://eod-hub.com${BUNDLE_PATH}`;
export async function bundleCheckout(db:SupabaseClient,b:RentalBundle,autoRenew:boolean,plan:"monthly"|"annual",origin:string,stripe=rentalStripe()) {
  if(!bundleCheckoutAllowed(b))throw new RentalError("Your bundle already has a paid term or needs billing review. Use Manage billing or contact hello@eod-hub.com.",409);
  if(b.stripe_subscription_id){
    const previous=await stripe.subscriptions.retrieve(b.stripe_subscription_id);
    if(!["canceled","incomplete_expired"].includes(previous.status))throw new RentalError("Resolve the existing subscription before purchasing another term.",409);
  }
  if(b.stripe_checkout_id){
    const previous=await stripe.checkout.sessions.retrieve(b.stripe_checkout_id);
    if(previous.status==="complete")throw new RentalError("Your completed checkout is being confirmed. Refresh shortly; do not pay again.",409);
    if(previous.status==="open"){
      if(autoRenew!==b.checkout_auto_renew||plan!==b.checkout_plan)throw new RentalError("Finish or cancel your open Stripe checkout before changing the renewal choice.",409);
      return previous.url;
    }
  }
  let attempt=b.checkout_attempt;
  if(b.checkout_pending){
    if(autoRenew!==b.checkout_auto_renew||plan!==b.checkout_plan)throw new RentalError("Your checkout is being prepared. Retry with the same renewal choice.",409);
  }else{
    attempt=randomUUID();
    const saved=await db.from("rental_legacy_bundles").update({checkout_pending:true,checkout_attempt:attempt,checkout_auto_renew:autoRenew,checkout_plan:plan,terms_accepted_at:new Date().toISOString(),terms_version:BUNDLE_TERMS}).eq("id",b.id).eq("checkout_attempt",b.checkout_attempt).eq("checkout_pending",false).select("id");checkDb(saved.error);
    if(saved.data?.length!==1)throw new RentalError("Your checkout changed. Refresh and retry.",409);
  }
  const customer=b.stripe_customer_id??(await stripe.customers.create({email:b.email,name:b.full_name,metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:b.id}},{idempotencyKey:`rental-bundle-customer-${b.id}`})).id;
  checkDb((await db.from("rental_legacy_bundles").update({stripe_customer_id:customer}).eq("id",b.id)).error);
  // A separate product keeps bundle invoices distinct from individual listing fees.
  const product=b.stripe_product_id??(await stripe.products.create({name:`EOD-HUB property bundle — ${b.listing_ids.length} properties`,tax_code:"txcd_10701000",metadata:{eod_rental_product:"legacy_bundle",rental_bundle_id:b.id}},{idempotencyKey:`rental-bundle-product-${b.id}`})).id;
  checkDb((await db.from("rental_legacy_bundles").update({stripe_product_id:product}).eq("id",b.id)).error);
  const session=await stripe.checkout.sessions.create({
    mode:"subscription",customer,line_items:[{price_data:{currency:"usd",product,unit_amount:plan==="annual"?b.annual_cents:b.monthly_cents,tax_behavior:"exclusive",recurring:{interval:plan==="annual"?"year":"month"}},quantity:1}],
    automatic_tax:await rentalAutomaticTax(stripe),billing_address_collection:"required",customer_update:{address:"auto"},
    integration_identifier:"eod-rentals-bundle-"+Array.from(attempt.replaceAll("-","").slice(0,8),c=>String.fromCharCode(97+parseInt(c,16))).join(""),
    metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:b.id},
    subscription_data:{metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:b.id,auto_renew:autoRenew?"true":"false",plan}},
    custom_text:{submit:{message:`One ${plan==="annual"?"annual":"monthly"} payment covers your ${b.listing_ids.length} existing property listings. Listing access begins at purchase. Automatic renewal is ${autoRenew?"ON":"OFF; the subscription will be set to end after this paid term"}. Social campaigns are separate.`}},
    success_url:`${origin}${BUNDLE_PATH}?checkout={CHECKOUT_SESSION_ID}`,cancel_url:`${origin}${BUNDLE_PATH}?checkout=canceled`,
  },{idempotencyKey:`rental-bundle-checkout-${b.id}-${attempt}`});
  checkDb((await db.from("rental_legacy_bundles").update({stripe_checkout_id:session.id,checkout_pending:false}).eq("id",b.id)).error);
  return session.url;
}
export async function syncBundle(db:SupabaseClient,sub:Stripe.Subscription,stripe=rentalStripe()) {
  if(sub.metadata.billing_subject!=="eod_rental_bundle")return false;
  const result=await db.from("rental_legacy_bundles").select("*").eq("id",sub.metadata.rental_bundle_id).maybeSingle();checkDb(result.error);
  const b=result.data as RentalBundle|null;
  if(!b||customerId(sub.customer)!==b.stripe_customer_id)throw new RentalError("Bundle billing ownership mismatch.",403);
  if(b.stripe_subscription_id&&b.stripe_subscription_id!==sub.id){
    const old=await stripe.subscriptions.retrieve(b.stripe_subscription_id);
    if(!["canceled","incomplete_expired"].includes(old.status)||sub.created<=old.created)return true;
  }
  // Enforce the recorded renewal choice even if Checkout's webhook is delayed.
  if(sub.metadata.auto_renew==="false"&&!sub.cancel_at_period_end&&!["canceled","incomplete_expired"].includes(sub.status))sub=await stripe.subscriptions.update(sub.id,{cancel_at_period_end:true});
  const invoice=typeof sub.latest_invoice==="string"?await stripe.invoices.retrieve(sub.latest_invoice):sub.latest_invoice;
  const item=sub.items.data[0];
  const plan=sub.metadata.plan=== "monthly"?"monthly":"annual";
  const expected=sub.items.data.length===1&&item?.price.unit_amount===(plan==="annual"?b.annual_cents:b.monthly_cents)&&item.price.currency==="usd"&&item.quantity===1&&item.price.recurring?.interval===(plan==="annual"?"year":"month")&&item.price.recurring.interval_count===1;
  if(!expected)throw new RentalError("The bundle price requires administrator review.",409);
  const patch:Record<string,unknown>={plan,stripe_subscription_id:sub.id,payment_status:sub.status,auto_renew:!sub.cancel_at_period_end&&sub.status!=="canceled"};
  if(invoice?.status==="paid"&&item.current_period_end){
    // Never shorten an already paid term because an older event arrived late.
    patch.paid_until=new Date(Math.max(Date.parse(b.paid_until??"")||0,item.current_period_end*1000)).toISOString();
    await queueBillingEmail(db,`bundle-receipt:${invoice.id}`,b.email,"Your three-property listing bundle is active",`Hi ${b.full_name.split(" ")[0]},\n\nPayment confirmed: ${billingMoney(invoice.amount_paid,invoice.currency)}. Your ${b.listing_ids.length} property listings are covered through ${billingDate(patch.paid_until as string)}.\n\nAutomatic renewal is ${patch.auto_renew?"on":"off"}. Your original social campaign still ends on November 20, 2026; additional social campaigns are separate.\n\nManage your properties and billing below. Questions? Reply to hello@eod-hub.com.`,link);
  }
  checkDb((await db.from("rental_legacy_bundles").update(patch).eq("id",b.id)).error);
  return true;
}
export async function confirmBundleCheckout(db:SupabaseClient,b:RentalBundle,id:string,stripe=rentalStripe()) {
  if(id!==b.stripe_checkout_id)throw new RentalError("Checkout does not belong to your account.",403);
  const session=await stripe.checkout.sessions.retrieve(id);
  if(session.metadata?.rental_bundle_id!==b.id||customerId(session.customer)!==b.stripe_customer_id)throw new RentalError("Checkout ownership mismatch.",403);
  if(session.status!=="complete"||session.payment_status==="unpaid")return;
  const idSub=customerId(session.subscription);if(idSub)await syncBundle(db,await stripe.subscriptions.retrieve(idSub),stripe);
}
export async function bundleBilling(db:SupabaseClient,b:RentalBundle,origin:string,stripe=rentalStripe()) {
  if(!b.stripe_customer_id)throw new RentalError("No billing account exists yet.");
  const portal=await rentalBillingPortal(b.stripe_customer_id,stripe,origin);return portal.url;
}
export async function bundleStripeEvent(db:SupabaseClient,event:Stripe.Event,stripe=rentalStripe()):Promise<boolean> {
  const object=event.data.object;
  if(event.type.startsWith("checkout.session.")){
    const session=object as Stripe.Checkout.Session;if(session.metadata?.billing_subject!=="eod_rental_bundle")return false;
    if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)){
      const result=await db.from("rental_legacy_bundles").select("*").eq("id",session.metadata.rental_bundle_id).single();checkDb(result.error);
      await confirmBundleCheckout(db,result.data as RentalBundle,session.id,stripe);
    }
    return true;
  }
  if(event.type.startsWith("customer.subscription.")){
    const sub=object as Stripe.Subscription;
    if(sub.metadata.billing_subject!=="eod_rental_bundle")return false;
    return syncBundle(db,await stripe.subscriptions.retrieve(sub.id),stripe);
  }
  if(event.type.startsWith("invoice.")){
    const invoice=object as Stripe.Invoice,id=subscriptionId(invoice);if(!id)return false;
    const sub=await stripe.subscriptions.retrieve(id);if(sub.metadata.billing_subject!=="eod_rental_bundle")return false;
    await syncBundle(db,sub,stripe);
    if(["invoice.payment_failed","invoice.payment_action_required"].includes(event.type)){
      const result=await db.from("rental_legacy_bundles").select("*").eq("stripe_subscription_id",sub.id).single();checkDb(result.error);const b=result.data as RentalBundle;
      await queueBillingEmail(db,`bundle-payment:${invoice.id}`,b.email,"Your bundle payment needs attention",`Your listing payment failed or needs bank verification. Open Manage billing to update your payment method. Existing paid access remains through ${b.paid_until?billingDate(b.paid_until):"the end of the complimentary period"}. A new listing term starts only after successful payment.`,invoice.hosted_invoice_url??link);
    }
    return true;
  }
  if(["charge.refunded","charge.dispute.created","radar.early_fraud_warning.created"].includes(event.type)){
    const risk=object as unknown as {id:string;charge?:string|Stripe.Charge;payment_intent?:string|Stripe.PaymentIntent|null};
    const charge=event.type==="charge.refunded"?object as Stripe.Charge:risk.charge?typeof risk.charge==="string"?await stripe.charges.retrieve(risk.charge):risk.charge:null;
    const intent=customerId(charge?.payment_intent??risk.payment_intent??null);if(!intent)return false;
    for await(const payment of stripe.invoicePayments.list({payment:{type:"payment_intent",payment_intent:intent},limit:100})){
      const invoice=typeof payment.invoice==="string"?await stripe.invoices.retrieve(payment.invoice):payment.invoice;
      if("deleted" in invoice && invoice.deleted)continue;
      const id=subscriptionId(invoice as Stripe.Invoice);if(!id)continue;
      const sub=await stripe.subscriptions.retrieve(id);if(sub.metadata.billing_subject!=="eod_rental_bundle")continue;
      const result=await db.from("rental_legacy_bundles").select("*").eq("stripe_subscription_id",sub.id).maybeSingle();checkDb(result.error);const b=result.data as RentalBundle|null;if(!b)continue;
      const deadline=new Date((event.created+7*86400)*1000).toISOString();
      if(!b.risk_hold_until||Date.parse(deadline)<Date.parse(b.risk_hold_until))checkDb((await db.from("rental_legacy_bundles").update({risk_hold_until:deadline}).eq("id",b.id)).error);
      if(!sub.cancel_at_period_end&&sub.status!=="canceled")await stripe.subscriptions.update(sub.id,{cancel_at_period_end:true});
      await queueBillingEmail(db,`bundle-risk:${event.id}:owner`,b.email,"Bundle billing review",`Stripe reported a refund, dispute or fraud warning affecting your bundle. Contact hello@eod-hub.com. Future renewal is stopped; listing visibility pauses on ${billingDate(deadline)} unless the review is resolved. Your property details are retained.`,link);
      await queueBillingEmail(db,`bundle-risk:${event.id}:admin`,OWNER_ADMIN_EMAIL,"Rental bundle requires review",`${b.full_name}: ${event.type}, reference ${risk.id}. Review before ${billingDate(deadline)}. Clear risk_hold_until only after resolving the incident.`,"https://eod-hub.com/admin");
      return true;
    }
  }
  return false;
}
export async function reconcileBundles(db:SupabaseClient,stripe=rentalStripe(),now=Date.now()) {
  const result=await db.from("rental_legacy_bundles").select("*").limit(1000);checkDb(result.error);
  for(let b of result.data as RentalBundle[]){
    if(b.stripe_subscription_id){
      await syncBundle(db,await stripe.subscriptions.retrieve(b.stripe_subscription_id),stripe);
      b=await ownerBundle(db,b.user_id);
    }
    const window=bundleReminder(b,now);if(!window)continue;
    const title=window.startsWith("annual")?(b.auto_renew?"Your listing bundle will renew soon":"Your listing bundle is ending"):window.startsWith("ended")?"Your listing bundle term has ended":window==="campaign-ended"?"Your 30-day rental campaign has ended":"Your rental campaign ends soon";
    const message=b.paid_until?`Hi ${b.full_name.split(" ")[0]},\n\nYour ${b.listing_ids.length}-property bundle term ends ${billingDate(b.paid_until)}. ${b.auto_renew?`Automatic renewal is on at ${billingMoney(b.plan==="annual"?b.annual_cents:b.monthly_cents)} per ${b.plan==="annual"?"year":"month"}, plus applicable tax. Use Manage billing to change your payment method or cancel renewal.`:`Automatic renewal is off. Open your property bundle to review billing or purchase another listing term after this term ends.`}`:`Hi ${b.full_name.split(" ")[0]},\n\nYour original 30-day campaign ends ${billingDate(b.complimentary_until)}. Keep all ${b.listing_ids.length} properties listed for ${billingMoney(b.monthly_cents)} per month or ${billingMoney(b.annual_cents)} per year, plus applicable tax. Your property details and photos are already in your account. Sign in and check out below. If you have not selected and paid for a monthly or annual plan by November 20, the promotion ends and your properties will be removed from the public listings. Your details and photos remain saved. Additional social campaigns are separate.\n\nQuestions? Reply to hello@eod-hub.com.`;
    await queueBillingEmail(db,`bundle-reminder:${b.id}:${window}`,b.email,title,message,link);
  }
}
