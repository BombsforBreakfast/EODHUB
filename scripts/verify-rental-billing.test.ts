import assert from "node:assert/strict";
import {test} from "node:test";
import type Stripe from "stripe";
import type {SupabaseClient} from "@supabase/supabase-js";
import {approveRentalProperty,handleRentalStripeEvent,syncRentalSubscription,rentalBillingPortal,rentalBillingReady} from "../app/lib/rentals/billing.server";
import type {PropertyRow,Provider} from "../app/lib/rentals/provider";

// Every Stripe operation is a local stub; these tests never charge a card,
// call a cloud database, or send an email.
delete process.env.RESEND_API_KEY;
type Row=Record<string,unknown>;
function database(property:PropertyRow){
  const tables:Record<string,Row[]>={rental_properties:[structuredClone(property) as unknown as Row],rental_campaigns:[]};
  const db={from(table:string){const filters:[string,unknown][]=[];let mode="read",value:Row={},ignore=false,conflict="";
    const run=()=>{const rows=tables[table]??[];const found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));if(mode==="update")for(const r of found)Object.assign(r,structuredClone(value));if(mode==="upsert"){const old=rows.find(r=>r[conflict]===value[conflict]);if(!old)rows.push({status:"awaiting_payment",paid:false,...structuredClone(value)});else if(!ignore)Object.assign(old,value);tables[table]=rows;}return{data:found,error:null};};
    const query={select(){return query;},eq(k:string,v:unknown){filters.push([k,v]);return query;},update(v:Row){mode="update";value=v;return query;},upsert(v:Row,options:{onConflict:string;ignoreDuplicates?:boolean}){mode="upsert";value=v;conflict=options.onConflict;ignore=!!options.ignoreDuplicates;return query;},async maybeSingle(){const result=run();return{data:result.data[0]??null,error:null};},then(resolve:(r:{data:Row[];error:null})=>unknown,reject?:(e:unknown)=>unknown){return Promise.resolve(run()).then(resolve,reject);}};return query;}};
  return{db:db as unknown as SupabaseClient,tables};
}
const owner="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222",submission="33333333-3333-4333-8333-333333333333";
const provider={user_id:owner,status:"approved",email:"synthetic@example.com",stripe_customer_id:"cus_local_only"} as Provider;
const payload={title:"Synthetic home",address:"1 Test Street",city:"Niceville",state:"FL",zip:"32578",installation:"Eglin AFB",propertyType:"House",rent:1800,rentPeriod:"month",priceBasis:"property",bedrooms:3,bathrooms:2,minimumLeaseMonths:9,deposit:1000,fees:"None",utilities:"Water",petDetails:"Contact owner for pet terms",description:"A synthetic property used only for isolated automated billing checks.",contactName:"Synthetic Owner",contactPhone:"8505550100",contactEmail:"synthetic@example.com",company:"",amenities:[],photos:[`${owner}/photos/44444444-4444-4444-8444-444444444444.webp`],militaryLeaseAccepted:true,photoRightsAccepted:true} as PropertyRow["submitted"];
function property(extra:Partial<PropertyRow>={}):PropertyRow{return{id,provider_id:owner,draft:payload!,submitted:payload,published:null,revision:1,submission_id:submission,review_status:"approved",review_note:null,status:"available-now",available_date:null,plan:"monthly",auto_renew:false,campaign_requested:true,stripe_subscription_id:null,payment_method_id:"pm_local_only",setup_order_id:null,payment_status:"unpaid",payment_url:null,paid_until:null,grace_until:null,hidden:true,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...extra};}
function stripe(paid=true){const created:Stripe.SubscriptionCreateParams[]=[];const subs:Stripe.Subscription[]=[];
  const stub={products:{async list(){return{data:[{id:"prod_listing",metadata:{eod_rental_product:"listing"}},{id:"prod_campaign",metadata:{eod_rental_product:"campaign"}}]};}},subscriptions:{async list(){return{data:subs,has_more:false};},async create(params:Stripe.SubscriptionCreateParams){created.push(params);const sub={id:"sub_local_only",customer:"cus_local_only",metadata:params.metadata,status:paid?"active":"incomplete",cancel_at_period_end:params.cancel_at_period_end,items:{data:[{current_period_end:Math.floor(Date.now()/1000)+30*86400}]},latest_invoice:{status:paid?"paid":"open",hosted_invoice_url:"https://invoice.stripe.com/local-only"}} as unknown as Stripe.Subscription;subs.push(sub);return sub;},async retrieve(){return subs[0];}}};
  return{client:stub as unknown as Stripe,created,subs};}
test("monthly approval bills $10 plus one $50 campaign, publishes only paid snapshot, and retries without a second subscription",async()=>{
  const row=property(),{db,tables}=database(row),mock=stripe();await approveRentalProperty(db,row,provider,mock.client);
  assert.equal(mock.created.length,1);const params=mock.created[0];assert.equal(params.items?.[0].price_data?.unit_amount,1000);assert.equal(params.items?.[0].price_data?.recurring.interval,"month");assert.equal(params.add_invoice_items?.[0].price_data?.unit_amount,5000);assert.equal(params.cancel_at_period_end,true);assert.equal(params.payment_behavior,"allow_incomplete","Approval must attempt the saved card, while retaining incomplete subscriptions for bank authentication");
  assert.deepEqual(tables.rental_properties[0].published,payload);assert.equal(tables.rental_campaigns.length,1);assert.equal(tables.rental_campaigns[0].status,"queued");
  await approveRentalProperty(db,row,provider,mock.client);assert.equal(mock.created.length,1,"Repeated approval recovers the existing subscription");assert.equal(tables.rental_campaigns.length,1);
});
test("annual approval bills $100 per year and renews only when opted in",async()=>{const row=property({plan:"annual",auto_renew:true,campaign_requested:false}),{db}=database(row),mock=stripe();await approveRentalProperty(db,row,provider,mock.client);assert.equal(mock.created[0].items?.[0].price_data?.unit_amount,10000);assert.equal(mock.created[0].items?.[0].price_data?.recurring.interval,"year");assert.equal(mock.created[0].cancel_at_period_end,false);assert.equal(mock.created[0].add_invoice_items,undefined);});
test("bank authentication or failed initial payment cannot publish or activate the campaign",async()=>{const row=property(),{db,tables}=database(row),mock=stripe(false);await approveRentalProperty(db,row,provider,mock.client);assert.equal(tables.rental_properties[0].published,null);assert.equal(tables.rental_properties[0].paid_until,null);assert.equal(tables.rental_campaigns[0].paid,false);});
test("approving edits retains the existing paid term and never calls Stripe",async()=>{const row=property({published:payload,paid_until:new Date(Date.now()+86400000).toISOString(),stripe_subscription_id:"sub_existing",payment_status:"active"}),{db,tables}=database(row);await approveRentalProperty(db,row,provider,{} as Stripe);assert.deepEqual(tables.rental_properties[0].published,payload);assert.equal(tables.rental_properties[0].stripe_subscription_id,"sub_existing");});
test("rental handlers leave ordinary member subscriptions and invoices to the existing webhook",async()=>{const{db}=database(property());assert.equal(await handleRentalStripeEvent(db,{type:"customer.subscription.updated",data:{object:{metadata:{billing_subject:"member"}}}} as unknown as Stripe.Event),false);assert.equal(await handleRentalStripeEvent(db,{type:"invoice.payment_succeeded",data:{object:{parent:{subscription_details:{subscription:"sub_member",metadata:{billing_subject:"member"}}}}}} as unknown as Stripe.Event),false);});
test("an old subscription event cannot replace a newer property subscription",async()=>{const row=property({stripe_subscription_id:"sub_new"}),{db,tables}=database(row);await syncRentalSubscription(db,{id:"sub_old",metadata:{rental_property_id:id,billing_subject:"eod_rental_property"}} as unknown as Stripe.Subscription,{} as Stripe);assert.equal(tables.rental_properties[0].stripe_subscription_id,"sub_new");});
test("the rental billing portal cannot switch a listing to unrelated membership prices",async()=>{
  let config:Stripe.BillingPortal.ConfigurationCreateParams|undefined;
  let session:Stripe.BillingPortal.SessionCreateParams|undefined;
  const mock={billingPortal:{configurations:{async list(){return{data:[]};},async create(params:Stripe.BillingPortal.ConfigurationCreateParams){config=params;return{id:"bpc_rental_only"};}},sessions:{async create(params:Stripe.BillingPortal.SessionCreateParams){session=params;return{url:"https://billing.stripe.com/local-only"};}}}} as unknown as Stripe;
  await rentalBillingPortal("cus_rental_only",mock);
  assert.equal(config?.features?.subscription_update?.enabled,false);assert.equal(config?.features?.payment_method_update?.enabled,true);assert.equal(session?.configuration,"bpc_rental_only");assert.equal(session?.customer,"cus_rental_only");
  await rentalBillingPortal("cus_rental_only",mock,"https://review-123.vercel.app");
  assert.equal(session?.return_url,"https://review-123.vercel.app/promote/rentals/portal");
});

test("production rental checkout requires a live connection while preview supports test cards",()=>{
  assert.equal(rentalBillingReady({NODE_ENV:'production',VERCEL_ENV:'production',STRIPE_WEBHOOK_SECRET:'whsec_synthetic',STRIPE_SECRET_KEY:'sk_test_synthetic'}),false);
  assert.equal(rentalBillingReady({NODE_ENV:'production',VERCEL_ENV:'preview',STRIPE_WEBHOOK_SECRET:'whsec_synthetic',STRIPE_SECRET_KEY:'sk_test_synthetic'}),true);
  assert.equal(rentalBillingReady({NODE_ENV:'production',VERCEL_ENV:'production',STRIPE_SECRET_KEY:'sk_test_existing_member',STRIPE_RENTALS_SECRET_KEY:'sk_live_synthetic',STRIPE_RENTALS_WEBHOOK_SECRET:'whsec_synthetic'}),true);
  assert.equal(rentalBillingReady({NODE_ENV:'production',STRIPE_SECRET_KEY:''}),false);
});
