import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type Stripe from "stripe";
import { supportFixture } from "./hub-support-fixture";
import { monthlySupportReady, supportNetCents, validMonthlyItem } from "../app/lib/hubSupportMonthly";
import { signSupportManagement, supportEmailHash, verifySupportManagement } from "../app/lib/server/hubSupportManagement";
import { handleMonthlySupportEvent } from "../app/lib/server/hubSupportSubscriptions";
import { drainSupportEmails, queueSupportEmail, sendSupportEmail } from "../app/lib/server/hubSupportEmail";
process.env.HUB_SUPPORT_MANAGE_SECRET = "synthetic-local-only-secret-32-characters";
process.env.HUB_SUPPORT_SITE_URL = "https://example.com";
delete process.env.RESEND_API_KEY;

test("secure management links bind subscription, email and environment, expire, and reject tampering", () => {
  const id=randomUUID(), email=supportEmailHash(" Supporter@Example.com "), now=Date.now();
  assert.equal(email,supportEmailHash("supporter@example.com"));
  const token=signSupportManagement(id,email,false,now);
  assert.equal(verifySupportManagement(token,false,now)?.id,id);
  assert.equal(verifySupportManagement(token,true,now),null);
  assert.equal(verifySupportManagement(token,false,now+3600000),null);
  assert.equal(verifySupportManagement(token.replace(token[10],token[10]==="a"?"b":"a"),false,now),null);
  assert.equal(verifySupportManagement(token+"x",false,now),null);
  assert.equal(verifySupportManagement(token+".extra",false,now),null);
});
test("monthly checkout stays disabled without all cancellation and receipt prerequisites", () => {
  const env={HUB_SUPPORT_MONTHLY_ENABLED:"true",STRIPE_SUPPORT_MONTHLY_PRODUCT_ID:"prod_test",STRIPE_SUPPORT_PORTAL_CONFIGURATION_ID:"bpc_test",RESEND_API_KEY:"synthetic",RESEND_FROM_EMAIL:"test@example.com",STRIPE_SUPPORT_WEBHOOK_SECRET:"synthetic",HUB_SUPPORT_RATE_SECRET:"synthetic",HUB_SUPPORT_MANAGE_SECRET:"x".repeat(32)};
  assert.equal(monthlySupportReady(env),true);
  for(const key of Object.keys(env)) assert.equal(monthlySupportReady({...env,[key]:""}),false,key);
  assert.equal(supportNetCents({amount_cents:300,refunded_cents:100,disputed_cents:300}),0);
});
test("monthly ownership validation rejects different products, amounts and billing intervals", () => {
  const item={quantity:1,price:{currency:"usd",unit_amount:300,product:"prod_support",recurring:{interval:"month",interval_count:1}}};
  assert.equal(validMonthlyItem([item],"prod_support",300),true);
  assert.equal(validMonthlyItem([item],"prod_rentals",300),false);
  assert.equal(validMonthlyItem([item],"prod_support",500),false);
  assert.equal(validMonthlyItem([item,item],"prod_support",300),false);
  assert.equal(validMonthlyItem([{...item,price:{...item.price,recurring:{interval:"year",interval_count:1}}}],"prod_support",300),false);
});
test("billing mail leases retry failed delivery without acknowledging it or duplicating a delivered receipt", async () => {
  const fixture=await supportFixture();
  try {
    const mail={recipient:"synthetic@example.com",subject:"Synthetic confirmation",message:"No real charge",link:"https://example.com/support-the-hub/manage",livemode:false};
    await queueSupportEmail(fixture.db,"paid:in_synthetic",mail);await queueSupportEmail(fixture.db,"paid:in_synthetic",mail);
    assert.deepEqual(await drainSupportEmails(fixture.db,false,async()=>false),{attempted:1,sent:0});
    assert.equal((await fixture.pg.query("select sent_at from hub_support_billing_emails")).rows[0].sent_at,null);
    assert.deepEqual(await drainSupportEmails(fixture.db,false,async()=>true),{attempted:0,sent:0},"A claimed record cannot send concurrently");
    await fixture.pg.query("update hub_support_billing_emails set claimed_until='2000-01-01'");
    assert.deepEqual(await drainSupportEmails(fixture.db,false,async (queued,key)=>{assert.equal(queued.recipient,mail.recipient);assert.match(key,/^hub-support-mail-/);return true;}),{attempted:1,sent:1});
    assert.deepEqual(await drainSupportEmails(fixture.db,false,async()=>true),{attempted:0,sent:0});
  } finally {await fixture.pg.close();}
});
test("billing emails escape content and cannot send to unapproved sandbox recipients",async()=>{
  const original=global.fetch;let calls=0,body:Record<string,string>={};
  process.env.RESEND_API_KEY="re_synthetic_local_only";process.env.RESEND_FROM_EMAIL="test@example.com";process.env.HUB_SUPPORT_TEST_EMAIL_ALLOWLIST="synthetic@example.com";
  global.fetch=(async (url:unknown,options:RequestInit)=>{assert.equal(String(url),"https://api.resend.com/emails");calls++;body=JSON.parse(String(options.body));return new Response(JSON.stringify({id:"local_mail_only"}),{status:200,headers:{"Content-Type":"application/json"}});}) as typeof fetch;
  try {
    const mail={recipient:"synthetic@example.com",subject:"Synthetic <confirmation>",message:"<script>never render HTML</script>",link:"https://example.com/support-the-hub/manage",livemode:false};
    assert.equal(await sendSupportEmail({...mail,recipient:"unapproved@example.com"},"local-denied"),false);assert.equal(calls,0);
    assert.equal(await sendSupportEmail(mail,"local-only"),true);assert.equal(calls,1);
    assert.match(body.html,/&lt;script&gt;/);assert.doesNotMatch(body.html,/<script>/);
    assert.equal(body.to,"synthetic@example.com");assert.match(body.text,/No real charge|never render HTML/);
  } finally {global.fetch=original;delete process.env.RESEND_API_KEY;delete process.env.HUB_SUPPORT_TEST_EMAIL_ALLOWLIST;}
});
test("monthly lifecycle persists real SQL, dedupes receipts and payments, recovers failures, and isolates unrelated billing", async () => {
  const fixture=await supportFixture();
  try {
    const id=randomUUID();await fixture.reserve(id,300,"prod_support");
    const sub={id:"sub_test",customer:"cus_test",livemode:false,status:"active",cancel_at_period_end:false,metadata:{purpose:"eod_hub_voluntary_support",support_subscription_id:id},items:{data:[{quantity:1,current_period_end:1799999999,price:{currency:"usd",unit_amount:300,product:"prod_support",recurring:{interval:"month",interval_count:1}}}]}};
    const invoice={id:"in_first",customer:"cus_test",livemode:false,currency:"usd",total:300,amount_paid:300,status:"paid",billing_reason:"subscription_create",number:"TEST-001",parent:{subscription_details:{subscription:sub.id}}};
    const charge={id:"ch_test",payment_intent:"pi_in_renew",amount:300,amount_refunded:0,currency:"usd",livemode:false};
    const client={subscriptions:{async retrieve(){return sub;}},customers:{async retrieve(){return{id:"cus_test",livemode:false,email:"synthetic@example.com"};}},invoices:{async retrieve(){return invoice;}},charges:{async retrieve(){return charge;}},invoicePayments:{list(params: {payment?:unknown}){if(params.payment)return{async *[Symbol.asyncIterator](){yield{invoice:"in_renew"};}};return Promise.resolve({data:[{status:"paid",amount_paid:300,payment:{type:"payment_intent",payment_intent:"pi_"+invoice.id}}],has_more:false});}}} as unknown as Stripe;
    const ctx={db:fixture.db,stripe:client,live:false};
    const event=(type:string,object:unknown,n=1)=>({id:`evt_${type}_${n}`,type,created:1800000000+n,livemode:false,data:{object}} as Stripe.Event);
    assert.equal((await handleMonthlySupportEvent(ctx,event("checkout.session.completed",{id:"cs_test",mode:"subscription",subscription:sub.id,metadata:{purpose:"eod_hub_voluntary_support",contribution_id:id}}))).handled,true);
    assert.equal((await fixture.pg.query("select paid_at from hub_contributions")).rows[0].paid_at,null,"Checkout alone never counts funds");
    await handleMonthlySupportEvent(ctx,event("invoice.paid",invoice));await handleMonthlySupportEvent(ctx,event("invoice.paid",invoice,2));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_contributions")).rows[0].n,1);
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_emails")).rows[0].n,2,"One receipt and one owner email per invoice");
    Object.assign(invoice,{id:"in_renew",billing_reason:"subscription_cycle",status:"open",amount_paid:0});Object.assign(sub,{status:"past_due"});
    await handleMonthlySupportEvent(ctx,event("invoice.payment_failed",invoice,3));await handleMonthlySupportEvent(ctx,event("invoice.payment_failed",invoice,4));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_issues where status='open'")).rows[0].n,1);
    Object.assign(invoice,{status:"paid",amount_paid:300});Object.assign(sub,{status:"active"});
    await handleMonthlySupportEvent(ctx,event("invoice.paid",invoice,5));
    await handleMonthlySupportEvent(ctx,event("invoice.payment_failed",invoice,6));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_issues where status='open'")).rows[0].n,0);
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_contributions where status='paid'")).rows[0].n,2);
    Object.assign(sub,{cancel_at_period_end:true});await handleMonthlySupportEvent(ctx,event("customer.subscription.updated",sub,7));await handleMonthlySupportEvent(ctx,event("customer.subscription.updated",sub,8));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_emails where subject='Monthly support cancellation confirmed'")).rows[0].n,2);
    await handleMonthlySupportEvent(ctx,event("charge.dispute.closed",{id:"dp_test",charge:"ch_test",status:"won",amount:300},9));
    await handleMonthlySupportEvent(ctx,event("charge.dispute.created",{id:"dp_test",charge:"ch_test",status:"needs_response",amount:300},10));
    assert.equal((await fixture.pg.query("select disputed_cents from hub_contributions where stripe_invoice_id='in_renew'")).rows[0].disputed_cents,0);
    assert.equal((await fixture.pg.query("select status from hub_support_billing_issues where incident_key='dispute:dp_test'")).rows[0].status,"resolved");
    await handleMonthlySupportEvent(ctx,event("radar.early_fraud_warning.created",{id:"issfr_test",charge:"ch_test"},11));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_issues where kind='fraud_warning'")).rows[0].n,1);
    charge.amount_refunded=150;
    await handleMonthlySupportEvent(ctx,event("charge.refunded",charge,12));
    await fixture.pg.query("update hub_support_billing_issues set status='resolved' where kind='refund'");
    await handleMonthlySupportEvent(ctx,event("charge.refunded",charge,12));
    assert.equal((await fixture.pg.query("select count(*)::int n from hub_support_billing_issues where kind='refund' and status='open'")).rows[0].n,0,"A webhook retry preserves the owner's reviewed state");
    const once=randomUUID();await fixture.pg.query("insert into hub_contributions(id,amount_cents,livemode,payment_intent_id) values($1,300,false,'pi_once')",[once]);
    assert.equal((await handleMonthlySupportEvent(ctx,event("charge.refunded",{...charge,payment_intent:"pi_once"},13))).handled,false,"Existing one-time refund handling retains its own authority");
    Object.assign(sub,{id:"sub_unrelated",customer:"cus_rentals",metadata:{purpose:"rental"}});
    assert.equal((await handleMonthlySupportEvent(ctx,event("customer.subscription.updated",sub,9))).handled,false);
  } finally {await fixture.pg.close();}
});
