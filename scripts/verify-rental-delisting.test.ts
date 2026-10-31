import assert from "node:assert/strict";
import {test} from "node:test";
import type Stripe from "stripe";
import {annualUnusedRefund,type Delisting} from "../app/lib/rentals/delisting";
import {processDelisting} from "../app/lib/rentals/delisting.server";
import {syncRentalSubscription,approveRentalProperty} from "../app/lib/rentals/billing.server";
import {listingHasPaidAccess,type PropertyRow,type Provider} from "../app/lib/rentals/provider";
import {database} from "./rental-billing-fixture";
delete process.env.RESEND_API_KEY;
const start=Date.parse("2026-01-01T00:00:00Z"),end=Date.parse("2027-01-01T00:00:00Z"),effective=start+100*86400000;
const line={amount:10000,discount_amounts:[],taxes:[],period:{start:start/1000,end:end/1000},parent:{subscription_item_details:{subscription_item:"si_annual",proration:false}}} as unknown as Stripe.InvoiceLineItem;
function fixture(plan:"annual"|"monthly"="annual"){
  const row={id:"22222222-2222-4222-8222-222222222222",provider_id:"11111111-1111-4111-8111-111111111111",delisted_at:new Date(effective).toISOString(),plan,stripe_subscription_id:"sub_local",paid_until:new Date(end).toISOString(),payment_status:"active",auto_renew:true,hidden:true} as PropertyRow;
  const job={id:"33333333-3333-4333-8333-333333333333",listing_id:row.id,provider_id:row.provider_id,label:"1 Synthetic Street",plan,reason:"Confirmed synthetic test",effective_at:row.delisted_at,state:"pending",refund_cents:null,refunded_cents:0} as Delisting;
  const{db,tables}=database(row);tables.rental_delistings=[structuredClone(job)];
  const sub={id:"sub_local",status:"active",metadata:{billing_subject:"eod_rental_property",rental_property_id:row.id,rental_provider_id:row.provider_id},items:{data:[{id:"si_annual",price:{recurring:{interval:"year"}}}]}};
  let canceled=0;
  const stripe={subscriptions:{async retrieve(){return sub;},async cancel(id:string,args:unknown){assert.equal(id,sub.id);assert.deepEqual(args,{prorate:false,invoice_now:false});canceled++;sub.status="canceled";}},invoices:{async *list(){yield{id:"in_paid",currency:"usd",amount_paid:15000,total:15000,parent:{subscription_details:{subscription:"sub_local"}}};},async *listLineItems(){yield{...line,amount:5000,parent:null};yield line;}}} as unknown as Stripe;
  return{row,job,db,tables,stripe,canceled:()=>canceled};
}
test("annual unused cash balance uses remaining days, discount and exclusive collected tax",()=>{
  assert.equal(annualUnusedRefund(line,effective),7260);
  assert.equal(annualUnusedRefund(line,start-86400000),10000);
  assert.equal(annualUnusedRefund(line,end+86400000),0);
  assert.equal(annualUnusedRefund({...line,discount_amounts:[{amount:2000,discount:"di_test"}],taxes:[{amount:800,tax_behavior:"exclusive"} as Stripe.InvoiceLineItem.Tax]},effective),6389);
  assert.throws(()=>annualUnusedRefund({...line,period:{start:start/1000,end:start/1000+30*86400}},effective),/annual billing period/);
});
test("annual cancellation is durable, excludes the campaign fee and never calls cash-refund APIs",async()=>{
  const f=fixture();await processDelisting(f.db,f.job,f.stripe);
  assert.equal(f.canceled(),1);assert.equal(f.tables.rental_delistings[0].state,"refund_due");assert.equal(f.tables.rental_delistings[0].refund_cents,7260);assert.equal(f.tables.rental_delistings[0].invoice_id,"in_paid");
  assert.equal(f.tables.rental_properties[0].auto_renew,false);assert.equal(f.tables.rental_billing_emails.length,2);
  await processDelisting(f.db,f.tables.rental_delistings[0] as Delisting,f.stripe);assert.equal(f.canceled(),1);
});
test("monthly delisting retains the paid month without a prorated refund",async()=>{
  const f=fixture("monthly");await processDelisting(f.db,f.job,f.stripe);assert.equal(f.canceled(),1);assert.equal(f.tables.rental_delistings[0].state,"completed");assert.equal(f.tables.rental_delistings[0].refund_cents,0);
});
test("prior refund/dispute history routes annual balance to manual review",async()=>{
  const f=fixture();f.tables.rental_billing_cases.push({id:"case",property_id:f.row.id,kind:"refund",status:"resolved"});await processDelisting(f.db,f.job,f.stripe);assert.equal(f.tables.rental_delistings[0].state,"manual_review");assert.equal(f.tables.rental_delistings[0].refund_cents,null);
});
test("Stripe cancellation failures stay pending for retry and alert Admin once",async()=>{
  const f=fixture(),stripe={subscriptions:{async retrieve(){throw Error("Simulated Stripe outage");}}} as unknown as Stripe;
  await processDelisting(f.db,f.job,stripe);await processDelisting(f.db,f.job,stripe);assert.equal(f.tables.rental_delistings[0].state,"pending");assert.match(f.tables.rental_delistings[0].last_error,/outage/);assert.equal(f.tables.rental_billing_emails.length,1);
});
test("late subscription webhooks cannot republish or restart a delisted property",async()=>{
  const f=fixture();const sub=await f.stripe.subscriptions.retrieve("sub_local");await syncRentalSubscription(f.db,sub,f.stripe);assert.equal(f.canceled(),1);assert.equal(listingHasPaidAccess(f.row,start),false);assert.equal(f.tables.rental_properties[0].payment_status,"canceled");
  await assert.rejects(()=>approveRentalProperty(f.db,f.row,{status:"approved"} as Provider,f.stripe),/delisted/);
});
