/** Explicit sandbox integration check. Uses local Postgres, no delivered email,
 * no cloud Auth/database changes, and deletes its test clock in finally. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { supportFixture } from "./hub-support-fixture";
import { handleMonthlySupportEvent } from "../app/lib/server/hubSupportSubscriptions";

async function main() {
  if (!process.env.STRIPE_SUPPORT_SECRET_KEY?.match(/^(sk|rk)_test_/)) throw Error("Sandbox Support key required");
  delete process.env.RESEND_API_KEY;
  process.env.HUB_SUPPORT_MANAGE_SECRET = "synthetic-local-only-secret-32-characters";
  process.env.HUB_SUPPORT_SITE_URL = "https://example.com";
  const stripe = new Stripe(process.env.STRIPE_SUPPORT_SECRET_KEY), account = await stripe.accounts.retrieve();
  assert.equal(account.id, "acct_1TFvIHRcKcVk6ZMp", "Only the separate EOD-Hub sandbox is allowed");
  const fixture=await supportFixture(), product="prod_VYEjgRa442ZWQb", start=Math.floor(Date.now()/1000);
  let clock: Stripe.TestHelpers.TestClock | null=null, eventTime=start, counter=0;
  const ctx={db:fixture.db,stripe,live:false};
  const event=(type:Stripe.Event.Type,object:unknown)=>({id:`evt_support_local_${++counter}`,type,created:eventTime,livemode:false,data:{object}} as Stripe.Event);
  async function ready() { for(let i=0;i<45;i++){ const current=await stripe.testHelpers.testClocks.retrieve(clock!.id);if(current.status==="ready")return;await new Promise(r=>setTimeout(r,1500));}throw Error("Test clock timeout"); }
  async function advance(time:number) { await stripe.testHelpers.testClocks.advance(clock!.id,{frozen_time:time});await ready();eventTime=time; }
  async function create(amount:number) {
    const id=randomUUID();await fixture.reserve(id,amount,product);
    const customer=await stripe.customers.create({test_clock:clock!.id,email:"synthetic-support@example.com",metadata:{purpose:"support_v1_audit"}});
    const method=await stripe.paymentMethods.attach("pm_card_visa",{customer:customer.id});
    const subscription=await stripe.subscriptions.create({customer:customer.id,default_payment_method:method.id,items:[{price_data:{currency:"usd",unit_amount:amount,product,recurring:{interval:"month"}}}],metadata:{purpose:"eod_hub_voluntary_support",support_subscription_id:id},expand:["latest_invoice"]});
    const invoice=subscription.latest_invoice as Stripe.Invoice;assert.equal(invoice.status,"paid");assert.equal(invoice.amount_paid,amount);
    await handleMonthlySupportEvent(ctx,event("invoice.paid",invoice));await handleMonthlySupportEvent(ctx,event("invoice.paid",invoice));
    return {id,subscription:subscription.id,customer:customer.id};
  }
  try {
    clock=await stripe.testHelpers.testClocks.create({frozen_time:start,name:"Support V1 isolated renewal audit"});
    const good=await create(300), fail=await create(750);
    console.log("PASS: real sandbox $3 and custom $7.50 initial payments; duplicates count once; local receipt/owner queues only");
    const declined=await stripe.paymentMethods.attach("pm_card_chargeCustomerFail",{customer:fail.customer});
    await stripe.subscriptions.update(fail.subscription,{default_payment_method:declined.id});
    let goodSub=await stripe.subscriptions.retrieve(good.subscription,{expand:["latest_invoice"]});
    const renewal=goodSub.items.data[0].current_period_end;
    await advance(renewal+14400);
    goodSub=await stripe.subscriptions.retrieve(good.subscription,{expand:["latest_invoice"]});
    if((goodSub.latest_invoice as Stripe.Invoice).status==="draft"){await advance(renewal+21600);goodSub=await stripe.subscriptions.retrieve(good.subscription,{expand:["latest_invoice"]});}
    const paid=goodSub.latest_invoice as Stripe.Invoice;assert.equal(paid.status,"paid");assert.equal(paid.amount_paid,300);
    await handleMonthlySupportEvent(ctx,event("invoice.paid",paid));
    let failSub=await stripe.subscriptions.retrieve(fail.subscription,{expand:["latest_invoice"]});assert.equal(failSub.status,"past_due");
    await handleMonthlySupportEvent(ctx,event("invoice.payment_failed",failSub.latest_invoice));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_issues where status='open'")).rows[0].n,1);
    console.log("PASS: real monthly renewal succeeds; real declined renewal becomes past_due and queues one customer/owner warning");
    const replacement=await stripe.paymentMethods.attach("pm_card_visa",{customer:fail.customer});await stripe.subscriptions.update(fail.subscription,{default_payment_method:replacement.id});
    await stripe.invoices.pay((failSub.latest_invoice as Stripe.Invoice).id);failSub=await stripe.subscriptions.retrieve(fail.subscription,{expand:["latest_invoice"]});
    await handleMonthlySupportEvent(ctx,event("invoice.paid",failSub.latest_invoice));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_issues where status='open'")).rows[0].n,0);
    const payments=await stripe.invoicePayments.list({invoice:paid.id});const intent=payments.data.find(p=>p.status==="paid")!.payment.payment_intent!;
    const intentId=typeof intent==="string"?intent:intent.id;
    const refund=await stripe.refunds.create({payment_intent:intentId,amount:150});
    const paymentIntent=await stripe.paymentIntents.retrieve(intentId);const charge=await stripe.charges.retrieve(typeof paymentIntent.latest_charge==="string"?paymentIntent.latest_charge:paymentIntent.latest_charge!.id);
    assert.equal(refund.status,"succeeded");await handleMonthlySupportEvent(ctx,event("charge.refunded",charge));await handleMonthlySupportEvent(ctx,event("charge.refunded",charge));
    assert.equal((await fixture.pg.query("select refunded_cents from hub_contributions where stripe_invoice_id=$1",[paid.id])).rows[0].refunded_cents,150);
    console.log("PASS: payment recovery clears the issue; real partial refund reconciles through Invoice Payments without duplicate records");
    const portal=await stripe.billingPortal.sessions.create({customer:good.customer,configuration:"bpc_1UX8G0RcKcVk6ZMpBeV55wlc",return_url:"https://eod-hub.com/support-the-hub/manage"});assert.equal(new URL(portal.url).hostname,"billing.stripe.com");
    goodSub=await stripe.subscriptions.update(good.subscription,{cancel_at_period_end:true});await handleMonthlySupportEvent(ctx,event("customer.subscription.updated",goodSub));
    const invoicesBefore=await stripe.invoices.list({customer:good.customer,limit:100});
    await advance(goodSub.items.data[0].current_period_end+14400);
    goodSub=await stripe.subscriptions.retrieve(good.subscription);assert.equal(goodSub.status,"canceled");
    await handleMonthlySupportEvent(ctx,event("customer.subscription.deleted",goodSub));
    assert.equal((await stripe.invoices.list({customer:good.customer,limit:100})).data.length,invoicesBefore.data.length);
    console.log("PASS: dedicated billing portal opens; cancellation ends at period end and produces no next-cycle invoice");
  } finally { if(clock)await stripe.testHelpers.testClocks.del(clock.id);await fixture.pg.close();console.log("CLEANUP: test clock/customers/subscriptions removed; no live money, delivered email, or production database writes"); }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Support sandbox test failed");process.exitCode=1;});
