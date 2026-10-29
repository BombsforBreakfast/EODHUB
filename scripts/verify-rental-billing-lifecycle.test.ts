import assert from "node:assert/strict";
import {test} from "node:test";
import type Stripe from "stripe";
import type {PropertyRow} from "../app/lib/rentals/provider";
import {listingHasPaidAccess} from "../app/lib/rentals/provider";
import {annualReminderWindow,billingDeadline,rentalNeedsNewTerm,type BillingCase} from "../app/lib/rentals/billing-lifecycle";
import {annualReminderEmail,drainBillingEmails,expireBillingCase,openBillingCase,paidInvoiceEmail,resolveBillingCases} from "../app/lib/rentals/billing-notifications.server";
import {handleRentalStripeEvent,syncRentalSubscription} from "../app/lib/rentals/billing.server";
import {database} from "./rental-billing-fixture";

delete process.env.RESEND_API_KEY;
const now=Date.parse("2026-10-29T12:00:00Z"),end=new Date(now+30*86400000).toISOString();
function property(extra:Partial<PropertyRow>={}):PropertyRow{return {id:"22222222-2222-4222-8222-222222222222",provider_id:"11111111-1111-4111-8111-111111111111",draft:{address:"1 Synthetic Street"},published:{address:"1 Synthetic Street"},submission_id:"33333333-3333-4333-8333-333333333333",review_status:"approved",plan:"monthly",auto_renew:true,campaign_requested:false,stripe_subscription_id:"sub_local_only",paid_until:end,grace_until:null,payment_status:"active",hidden:false,...extra} as PropertyRow;}
function invoice(extra:Record<string,unknown>={}){return {id:"in_synthetic",status:"paid",amount_paid:1000,currency:"usd",number:"RENTAL-001",hosted_invoice_url:"https://invoice.stripe.com/i/synthetic",lines:{data:[{description:"Monthly property listing",amount:1000}]},parent:{subscription_details:{subscription:"sub_local_only",metadata:{billing_subject:"eod_rental_property"}}},...extra} as unknown as Stripe.Invoice;}
function subscription(row:PropertyRow,extra:Record<string,unknown>={}){return {id:row.stripe_subscription_id,customer:"cus_local_only",status:"active",metadata:{billing_subject:"eod_rental_property",rental_property_id:row.id,rental_provider_id:row.provider_id,rental_submission_id:row.submission_id},cancel_at_period_end:false,items:{data:[{current_period_end:Date.parse(end)/1000}]},latest_invoice:invoice(),...extra} as unknown as Stripe.Subscription;}
const event=(type:string,object:unknown,created=now/1000,previous?:unknown)=>({id:"evt_synthetic",type,created,data:{object,previous_attributes:previous}} as unknown as Stripe.Event);

test("receipts contain the actual paid amount and invoice, deduplicate by invoice, and retry failed delivery",async()=>{
  const row=property(),{db,tables,setTime}=database(row);setTime(now);
  await paidInvoiceEmail(db,row,invoice());await paidInvoiceEmail(db,row,invoice());
  assert.equal(tables.rental_billing_emails.length,1);const email=tables.rental_billing_emails[0];assert.match(email.message,/\$10\.00/);assert.equal(email.link,invoice().hosted_invoice_url);
  const calls:string[]=[];assert.equal((await drainBillingEmails(db,async(...args)=>{calls.push(args[4]!);return false;})).sent,0);
  assert.equal((await drainBillingEmails(db,async()=>{throw Error("must remain leased");})).attempted,0);
  setTime(now+16*60000);assert.equal((await drainBillingEmails(db,async(...args)=>{calls.push(args[4]!);return true;})).sent,1);
  assert.equal(calls[0],calls[1],"Resend idempotency key stays stable after retry");assert.ok(email.sent_at);
  assert.equal((await drainBillingEmails(db,async()=>false)).attempted,0);
});
test("one failed invoice alerts the provider and owner once and never extends its seven-day deadline",async()=>{
  const row=property({paid_until:new Date(now-1000).toISOString()}),{db,tables}=database(row);
  const input={incident_key:"invoice:in_fail",kind:"payment_failed" as const,stripe_object_id:"in_fail",subscription_id:"sub_local_only",detail:"Update your payment method.",started:now};
  await openBillingCase(db,row,input);await openBillingCase(db,row,{...input,started:now+86400000});
  assert.equal(tables.rental_billing_cases.length,1);assert.equal(tables.rental_billing_cases[0].deadline,billingDeadline(now));assert.equal(tables.rental_billing_emails.length,2);
  assert.equal(tables.rental_properties[0].grace_until,billingDeadline(now));assert.equal(listingHasPaidAccess(tables.rental_properties[0] as PropertyRow,now+6*86400000),true);assert.equal(listingHasPaidAccess(tables.rental_properties[0] as PropertyRow,now+7*86400000),false);
});
test("an unpaid initial listing never gets public access from a grace window",async()=>{
  const row=property({paid_until:null,published:null,payment_status:"incomplete"}),{db,tables}=database(row);
  await openBillingCase(db,row,{incident_key:"invoice:initial",kind:"payment_failed",stripe_object_id:"initial",subscription_id:"sub_local_only",detail:"Initial payment failed.",started:now});
  assert.equal(listingHasPaidAccess(tables.rental_properties[0] as PropertyRow,now),false);
});
test("payment recovery clears payment cases but retains unrelated disputes",async()=>{
  const row=property(),{db,tables}=database(row);
  for(const kind of ["payment_failed","dispute"] as const)await openBillingCase(db,row,{incident_key:kind,kind,stripe_object_id:kind,subscription_id:"sub_local_only",detail:kind,started:now});
  await syncRentalSubscription(db,subscription(row),{} as Stripe);
  assert.equal(tables.rental_billing_cases.find(c=>c.kind==="payment_failed")?.status,"resolved");assert.equal(tables.rental_billing_cases.find(c=>c.kind==="dispute")?.status,"open");assert.equal(tables.rental_properties[0].billing_hold_until,billingDeadline(now));
});
test("annual reminders cover both renewal choices, have two windows, and send once per window",async()=>{
  const row=property({plan:"annual",auto_renew:false}),{db,tables}=database(row);
  await annualReminderEmail(db,row,now);await annualReminderEmail(db,row,now+86400000);
  assert.equal(tables.rental_billing_emails.length,1);assert.match(tables.rental_billing_emails[0].message,/Automatic renewal is off/);
  await annualReminderEmail(db,{...row,auto_renew:true},Date.parse(end)-6*86400000);assert.equal(tables.rental_billing_emails.length,2);assert.match(tables.rental_billing_emails[1].message,/\$100/);
  assert.equal(annualReminderWindow(end,Date.parse(end)),null);assert.equal(annualReminderWindow(end,now-86400000),null);
});
test("an ended annual term remains visible seven days and becomes eligible for a new cart term",()=>{
  const row=property({payment_status:"canceled",paid_until:new Date(now-86400000).toISOString(),grace_until:billingDeadline(now-86400000)});
  assert.equal(listingHasPaidAccess(row,now),true);assert.equal(rentalNeedsNewTerm(row,now),true);assert.equal(listingHasPaidAccess(row,now+7*86400000),false);
  assert.equal(rentalNeedsNewTerm({...row,payment_status:"active"},now),false);
});
test("expired review stops future billing once and a replacement subscription is preserved",async()=>{
  const row=property(),{db,tables}=database(row);
  await openBillingCase(db,row,{incident_key:"refund:ch_test",kind:"refund",stripe_object_id:"ch_test",subscription_id:"sub_local_only",detail:"Refund review.",started:now-8*86400000});
  let canceled=0;const stripe={subscriptions:{async retrieve(){return subscription(row);},async cancel(){canceled++;}}} as unknown as Stripe;
  await expireBillingCase(db,tables.rental_billing_cases[0] as BillingCase,stripe);await expireBillingCase(db,tables.rental_billing_cases[0] as BillingCase,stripe);
  assert.equal(canceled,1);assert.equal(tables.rental_properties[0].payment_status,"canceled");assert.equal(tables.rental_billing_cases[0].status,"expired");
  assert.equal(listingHasPaidAccess(tables.rental_properties[0] as PropertyRow,now),false);
});
test("a resolved case cannot cancel a subscription when a delayed expiry job resumes",async()=>{
  const row=property(),{db,tables}=database(row);
  await openBillingCase(db,row,{incident_key:"refund:resolved",kind:"refund",stripe_object_id:"resolved",subscription_id:"sub_local_only",detail:"Review.",started:now});
  await resolveBillingCases(db,row.id,["refund"],"Reviewed and settled.");
  await expireBillingCase(db,tables.rental_billing_cases[0] as BillingCase,{} as Stripe);
  assert.equal(tables.rental_properties[0].payment_status,"active");assert.equal(tables.rental_properties[0].billing_hold_until,null);
});
test("out-of-order failed-payment events read current Stripe state and do not reopen a paid invoice",async()=>{
  const row=property(),{db,tables}=database(row),sub=subscription(row);
  const stripe={subscriptions:{async retrieve(){return sub;}},invoices:{async retrieve(){return invoice();}}} as unknown as Stripe;
  await handleRentalStripeEvent(db,event("invoice.payment_failed",invoice({status:"open"})),stripe);
  assert.equal(tables.rental_billing_cases.length,0);assert.equal(tables.rental_billing_emails.length,1);assert.match(tables.rental_billing_emails[0].subject,/Payment confirmation/);
});
test("refund, dispute and fraud events resolve ownership through InvoicePayments and isolate ordinary payments",async()=>{
  const row=property(),{db,tables}=database(row);
  const stripe={invoicePayments:{list(){return(async function*(){yield{invoice:invoice()};})();}}} as unknown as Stripe;
  for(const [type,id] of [["charge.refunded","ch_test"],["charge.dispute.created","dp_test"],["radar.early_fraud_warning.created","issfr_test"]])await handleRentalStripeEvent(db,event(type,{id,payment_intent:"pi_test",amount_refunded:1000,amount:1000,currency:"usd"}),stripe);
  assert.deepEqual(tables.rental_billing_cases.map(c=>c.kind),["refund","dispute","fraud_warning"]);
  await handleRentalStripeEvent(db,event("charge.dispute.closed",{id:"dp_test",payment_intent:"pi_test",status:"won",created:now/1000}),stripe);
  assert.equal(tables.rental_billing_cases.find(c=>c.kind==="dispute")?.status,"resolved");
  const ordinary={invoicePayments:{list(){return(async function*(){yield{invoice:invoice({parent:{subscription_details:{subscription:"sub_member"}}})};})();}}} as unknown as Stripe;
  assert.equal(await handleRentalStripeEvent(db,event("charge.refunded",{id:"ch_member",payment_intent:"pi_member"}),ordinary),false);
});
test("payment method updates reach rental subscriptions even when they had an explicit old card",async()=>{
  const row=property(),{db}=database(row),updates:unknown[]=[];
  const stripe={customers:{async retrieve(){return{invoice_settings:{default_payment_method:"pm_replacement"}};}},subscriptions:{async retrieve(){return subscription(row,{default_payment_method:"pm_old"});},async update(id:string,body:unknown){updates.push([id,body]);}}} as unknown as Stripe;
  await handleRentalStripeEvent(db,event("customer.updated",{id:"cus_local_only"},now/1000,{invoice_settings:{default_payment_method:"pm_old"}}),stripe);
  assert.deepEqual(updates,[["sub_local_only",{default_payment_method:"pm_replacement"}]]);
});
test("stopped collection alerts both parties even when Stripe still reports an active subscription",async()=>{
  const row=property(),{db,tables}=database(row),sub=subscription(row,{pause_collection:{behavior:"void",resumes_at:null}});
  const stripe={subscriptions:{async retrieve(){return sub;}}} as unknown as Stripe;
  await handleRentalStripeEvent(db,event("customer.subscription.updated",sub),stripe);
  assert.equal(tables.rental_billing_cases[0].kind,"payment_stopped");assert.equal(tables.rental_billing_cases[0].deadline,billingDeadline(now));
  assert.equal(tables.rental_billing_emails.filter(e=>e.subject!=="Payment confirmation").length,2);
  await syncRentalSubscription(db,sub,stripe);assert.equal(tables.rental_billing_cases[0].status,"open");
  await syncRentalSubscription(db,{...sub,pause_collection:null},stripe);assert.equal(tables.rental_billing_cases[0].status,"resolved");
});
test("a won dispute delivered before its create event cannot reopen the review",async()=>{
  const row=property(),{db,tables}=database(row),stripe={invoicePayments:{list(){return(async function*(){yield{invoice:invoice()};})();}}} as unknown as Stripe;
  await handleRentalStripeEvent(db,event("charge.dispute.closed",{id:"dp_won_first",payment_intent:"pi_test",status:"won",created:now/1000}),stripe);
  await handleRentalStripeEvent(db,event("charge.dispute.created",{id:"dp_won_first",payment_intent:"pi_test",status:"needs_response",amount:1000,currency:"usd",created:now/1000}),stripe);
  assert.equal(tables.rental_billing_cases.length,1);assert.equal(tables.rental_billing_cases[0].status,"resolved");assert.equal(tables.rental_billing_emails.length,0);assert.equal(tables.rental_properties[0].billing_hold_until,null);
});
