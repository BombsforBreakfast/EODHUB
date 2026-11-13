import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bundleVisible,bundleListingVisible,bundleQuote,bundleCheckoutAllowed,bundleReminder,type RentalBundle } from "../app/lib/rentals/bundle";
import { bundleCheckout,syncBundle,confirmBundleCheckout,ownerBundle } from "../app/lib/rentals/bundle.server";
const now=Date.parse("2026-11-12T15:00:00Z"),end="2026-11-21T04:59:59Z";
function bundle(extra:Partial<RentalBundle>={}):RentalBundle{return {id:"11111111-1111-4111-8111-111111111111",owner_slug:"synthetic",user_id:"22222222-2222-4222-8222-222222222222",full_name:"Synthetic Owner",email:"synthetic@example.com",listing_ids:["one","two","three"],annual_cents:20000,monthly_cents:2500,plan:"annual",checkout_plan:"annual",approved_at:"2026-10-20T18:52:00Z",campaign_started_at:"2026-10-21T20:38:00Z",complimentary_until:end,campaign_metrics:{},stripe_customer_id:"cus_local",stripe_subscription_id:null,stripe_checkout_id:null,checkout_attempt:"33333333-3333-4333-8333-333333333333",checkout_pending:false,checkout_auto_renew:false,auto_renew:false,payment_status:"unpaid",paid_until:null,risk_hold_until:null,terms_accepted_at:null,terms_version:null,invitation_sent_at:"2026-11-12T14:00:00Z",...extra};}
type Row=Record<string,unknown>;
function database(initial:RentalBundle){const rows:Record<string,Row[]>={rental_legacy_bundles:[structuredClone(initial) as unknown as Row],rental_billing_emails:[]};
 const db={from(table:string){const filters:((r:Row)=>boolean)[]=[];let patch:Row|undefined,upsert:Row|undefined;const q={select(){return q;},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return q;},update(p:Row){patch=p;return q;},upsert(p:Row){upsert=p;return q;},maybeSingle(){return execute(true);},single(){return execute(true);},then(resolve:(r:unknown)=>void,reject:(e:unknown)=>void){return execute(false).then(resolve,reject);}};async function execute(single:boolean){if(upsert&&!rows[table].some(r=>r.message_key===upsert!.message_key))rows[table].push(upsert);const matched=rows[table].filter(r=>filters.every(f=>f(r)));if(patch)for(const r of matched)Object.assign(r,patch);return{data:single?matched[0]??null:matched,error:null};}return q;}} as unknown as SupabaseClient;return{db,rows,current:()=>rows.rental_legacy_bundles[0] as unknown as RentalBundle};}
function subscription(extra:Record<string,unknown>={}):Stripe.Subscription{return {id:"sub_local",created:now/1000,customer:"cus_local",status:"active",metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:bundle().id,auto_renew:"false",plan:"annual"},cancel_at_period_end:false,items:{data:[{quantity:1,current_period_end:Date.parse("2027-11-12T15:00:00Z")/1000,price:{unit_amount:20000,currency:"usd",recurring:{interval:"year",interval_count:1}}}]},latest_invoice:{id:"in_local",status:"paid",amount_paid:20000,currency:"usd"},...extra} as unknown as Stripe.Subscription;}
test("complimentary listings end after Nov 20 Eastern, and paid terms preserve access",()=>{assert.equal(bundleVisible(bundle(),Date.parse(end)-1),true);assert.equal(bundleVisible(bundle(),Date.parse(end)),false);assert.equal(bundleVisible(bundle({paid_until:"2027-11-12T15:00:00Z"}),Date.parse(end)+1),true);});
test("an expired refund/dispute hold blocks both complimentary and paid access",()=>{assert.equal(bundleVisible(bundle({paid_until:"2027-11-12T15:00:00Z",risk_hold_until:end}),Date.parse(end)+1),false);});
test("active or unresolved subscriptions cannot create another charge",()=>{assert.equal(bundleCheckoutAllowed(bundle(),now),true);for(const extra of [{paid_until:end},{risk_hold_until:end},{stripe_subscription_id:"sub_x",payment_status:"active"},{stripe_subscription_id:"sub_x",payment_status:"past_due"}])assert.equal(bundleCheckoutAllowed(bundle(extra),now),false);assert.equal(bundleCheckoutAllowed(bundle({stripe_subscription_id:"sub_x",payment_status:"canceled"}),now),true);});
test("conversion reminders wait for a sent invitation and stop after purchase",()=>{assert.equal(bundleReminder(bundle({invitation_sent_at:null}),Date.parse(end)),null);assert.equal(bundleReminder(bundle(),Date.parse(end)-2*86400000),"campaign-three-days");assert.equal(bundleReminder(bundle(),Date.parse(end)),"campaign-ended");assert.equal(bundleReminder(bundle({paid_until:"2027-11-12T15:00:00Z"}),now),null);});
test("monthly terms get a seven-day reminder, annual terms get 30 and seven",()=>{const paid_until="2027-11-12T15:00:00Z",base=Date.parse(paid_until);assert.match(bundleReminder(bundle({paid_until}),base-20*86400000)!,/:30$/);assert.equal(bundleReminder(bundle({paid_until,plan:"monthly"}),base-20*86400000),null);assert.match(bundleReminder(bundle({paid_until,plan:"monthly"}),base-3*86400000)!,/:7$/);});
test("bundle lookup enforces ownership",async()=>{const f=database(bundle());await assert.rejects(()=>ownerBundle(f.db,"other-owner"),/No existing-property bundle/);assert.equal((await ownerBundle(f.db,bundle().user_id)).id,bundle().id);});
test("annual fulfillment disables renewal before recording paid access and queues one receipt",async()=>{const f=database(bundle());let updates=0;const sub=subscription(),stripe={subscriptions:{async update(){updates++;return{...sub,cancel_at_period_end:true};}}} as unknown as Stripe;await syncBundle(f.db,sub,stripe);await syncBundle(f.db,{...sub,cancel_at_period_end:true},stripe);assert.equal(updates,1);assert.equal(f.current().auto_renew,false);assert.equal(f.current().paid_until,"2027-11-12T15:00:00.000Z");assert.equal(f.rows.rental_billing_emails.length,1);});
test("an unpaid invoice never grants a new term",async()=>{const f=database(bundle());await syncBundle(f.db,subscription({latest_invoice:{id:"in_unpaid",status:"open"},cancel_at_period_end:true}),{} as Stripe);assert.equal(f.current().paid_until,null);assert.equal(f.rows.rental_billing_emails.length,0);});
test("price or customer mismatches fail closed",async()=>{const f=database(bundle());await assert.rejects(()=>syncBundle(f.db,subscription({customer:"cus_other"}),{} as Stripe),/ownership/);const wrong=subscription({cancel_at_period_end:true});wrong.items.data[0].price.unit_amount=10000;await assert.rejects(()=>syncBundle(f.db,wrong,{} as Stripe),/price/);assert.equal(f.current().paid_until,null);});
test("monthly bundle verifies the $25 monthly Stripe price",async()=>{const f=database(bundle()),sub=subscription({cancel_at_period_end:true,metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:bundle().id,auto_renew:"false",plan:"monthly"}});sub.items.data[0].price.unit_amount=2500;sub.items.data[0].price.recurring!.interval="month";await syncBundle(f.db,sub,{} as Stripe);assert.equal(f.current().plan,"monthly");});
test("older subscription events cannot replace the current subscription",async()=>{const f=database(bundle({stripe_subscription_id:"sub_new"}));await syncBundle(f.db,subscription(),{subscriptions:{async retrieve(){return subscription({id:"sub_new",status:"active"});}}} as unknown as Stripe);assert.equal(f.current().stripe_subscription_id,"sub_new");assert.equal(f.current().paid_until,null);});
test("checkout returns do not grant access for unpaid sessions or a foreign session",async()=>{const f=database(bundle({stripe_checkout_id:"cs_local"}));await assert.rejects(()=>confirmBundleCheckout(f.db,f.current(),"cs_other",{} as Stripe),/belong/);await confirmBundleCheckout(f.db,f.current(),"cs_local",{checkout:{sessions:{async retrieve(){return{id:"cs_local",customer:"cus_local",status:"complete",payment_status:"unpaid",metadata:{rental_bundle_id:bundle().id}};}}}} as unknown as Stripe);assert.equal(f.current().paid_until,null);});
test("checkout prices and renewal consent come from the server, and retries reuse an open session",async()=>{const f=database(bundle());let created=0;let params:Stripe.Checkout.SessionCreateParams|undefined;const stripe={products:{async create(){return{id:"prod_local"};}},checkout:{sessions:{async create(p:Stripe.Checkout.SessionCreateParams){created++;params=p;return{id:"cs_local",url:"https://checkout.stripe.com/local",status:"open"};},async retrieve(){return{id:"cs_local",url:"https://checkout.stripe.com/local",status:"open"};}}}} as unknown as Stripe;await bundleCheckout(f.db,f.current(),false,"monthly","https://preview.example",stripe);assert.equal(params?.line_items?.[0].price_data?.unit_amount,2500);assert.equal(params?.line_items?.[0].price_data?.recurring?.interval,"month");assert.equal(params?.subscription_data?.metadata?.auto_renew,"false");assert.match(params?.success_url??"",/^https:\/\/preview.example\//);await bundleCheckout(f.db,f.current(),false,"monthly","https://preview.example",stripe);assert.equal(created,1);await assert.rejects(()=>bundleCheckout(f.db,f.current(),true,"monthly","https://preview.example",stripe),/open Stripe checkout/);});

test("selected properties use standard per-listing prices while the full existing offer stays unchanged",()=>{
 const b=bundle({available_listing_ids:["one","two","three"],checkout_listing_ids:["one","three"]});
 assert.deepEqual(bundleQuote(b,["one","three"]).monthly,{total:2000,unit:1000,quantity:2});
 assert.deepEqual(bundleQuote(b,["one","three"]).annual,{total:20000,unit:10000,quantity:2});
 assert.equal(bundleQuote(b,["one","two","three"]).monthly.total,2500);
 assert.equal(bundleQuote(b,["one","two","three"]).annual.total,20000);
 for(const ids of [[],["other"],["one","one"]])assert.throws(()=>bundleQuote(b,ids));
});
test("unselected inventory never becomes permanently public after buying a subset",()=>{
 const b=bundle({available_listing_ids:["one","two","three"],listing_ids:["one","three"]});
 assert.equal(bundleListingVisible(b,"two",now),true,"Existing complimentary access is preserved before purchase");
 const paid={...b,paid_until:"2027-01-12T15:00:00Z"};
 assert.equal(bundleListingVisible(paid,"one",now),true);assert.equal(bundleListingVisible(paid,"two",now),false);
 for(const id of ["one","two","three"])assert.equal(bundleListingVisible(b,id,Date.parse(end)+1),false);
});
test("checkout locks the selected properties and charges two monthly units at ten dollars each",async()=>{
 const f=database(bundle({available_listing_ids:["one","two","three"],checkout_listing_ids:["one","three"]}));
 let params:Stripe.Checkout.SessionCreateParams|undefined,created=0;
 const stripe={products:{async create(){return{id:"prod_local"};}},checkout:{sessions:{async create(p:Stripe.Checkout.SessionCreateParams){created++;params=p;return{id:"cs_local",url:"https://checkout.stripe.com/local"};},async retrieve(){return{id:"cs_local",status:"open",url:"https://checkout.stripe.com/local"};}}}} as unknown as Stripe;
 await bundleCheckout(f.db,f.current(),false,"monthly","https://preview.example",stripe,["three","one"]);
 assert.equal(params?.line_items?.[0].price_data?.unit_amount,1000);assert.equal(params?.line_items?.[0].quantity,2);
 assert.equal(params?.subscription_data?.metadata?.listing_ids,JSON.stringify(["one","three"]));
 assert.deepEqual(f.current().listing_ids,["one","two","three"],"Current access changes only after payment");
 await assert.rejects(()=>bundleCheckout(f.db,f.current(),false,"monthly","https://preview.example",stripe,["two"]),/open Stripe checkout/);
 assert.equal(created,1);
});
test("paid fulfillment covers exactly the selected owned properties and preserves the saved inventory",async()=>{
 const f=database(bundle({available_listing_ids:["one","two","three"],checkout_listing_ids:["one","three"]}));
 const sub=subscription({cancel_at_period_end:true,metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:bundle().id,auto_renew:"false",plan:"monthly",listing_ids:JSON.stringify(["one","three"])}});
 sub.items.data[0].quantity=2;sub.items.data[0].price.unit_amount=1000;sub.items.data[0].price.recurring!.interval="month";
 await syncBundle(f.db,sub,{} as Stripe);
 assert.deepEqual(f.current().listing_ids,["one","three"]);assert.deepEqual(f.current().available_listing_ids,["one","two","three"]);
 assert.equal(f.rows.rental_billing_emails.length,1);assert.match(String(f.rows.rental_billing_emails[0].subject),/2-property/);
});
test("a subscription cannot cover another owner's property or a duplicate listing",async()=>{
 for(const ids of [["other"],["one","one"]]){
  const f=database(bundle({available_listing_ids:["one","two","three"]}));
  const sub=subscription({cancel_at_period_end:true,metadata:{billing_subject:"eod_rental_bundle",rental_bundle_id:bundle().id,auto_renew:"false",plan:"monthly",listing_ids:JSON.stringify(ids)}});
  await assert.rejects(()=>syncBundle(f.db,sub,{} as Stripe),/selection/);assert.equal(f.current().paid_until,null);
 }
});
