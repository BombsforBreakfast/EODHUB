import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import type {SupabaseClient} from '@supabase/supabase-js';
import {cancelReport,syncReportSubscription} from '../app/lib/server/jobReportBilling';
import {drainReportDeliveries,renderReportDelivery,type ReportDelivery} from '../app/lib/server/jobReportDelivery';
import {readReportToken,reportToken,reportTestAllowed,startReportCheckout,type ReportContext} from '../app/lib/server/jobReport';
import {JOB_REPORT_PURPOSE} from '../app/lib/jobReport';

process.env.JOB_REPORT_MODE='test';process.env.JOB_REPORT_TOKEN_SECRET='local-fixture-secret-at-least-32-characters';
process.env.JOB_REPORT_TEST_EMAIL_ALLOWLIST='test@example.org';process.env.STRIPE_JOB_REPORT_PRICE_ID='price_report';
process.env.STRIPE_JOB_REPORT_PRODUCT_ID='prod_report';process.env.STRIPE_JOB_REPORT_WEBHOOK_SECRET='whsec_fixture';process.env.JOB_REPORT_ENABLED='true';
// Every provider operation is stubbed. These tests never charge, send, or access a live DB.
function harness(){
 const id='11111111-1111-4111-8111-111111111111';
 const subscriber={id,email:'test@example.org',livemode:false,stripe_customer_id:'cus_report',stripe_subscription_id:'sub_report',subscription_created:1,status:'active',paid_until:new Date(Date.now()+86400000).toISOString(),unsubscribed_at:null,suppressed_at:null,risk_hold:false,cancel_at_period_end:false,checkout_key:'fixed-key',checkout_started_at:new Date().toISOString(),checkout_session_id:null,initial_prepared:false};
 const delivery={id:'22222222-2222-4222-8222-222222222222',subscriber_id:id,kind:'initial',recipient:'test@example.org',payload:{date:'2026-11-11',jobs:[{id:'job',title:'EOD Technician',applyUrl:'https://example.org/apply'}]},livemode:false,attempts:0,first_attempt_at:null,expires_at:null,resend_message_id:null,status:'pending',next_attempt_at:new Date(0).toISOString(),claimed_until:null};
 const tables:Record<string,any[]>={job_report_subscribers:[subscriber],job_report_deliveries:[delivery]};
 const calls:Record<string,any[]>={sync:[],initial:[],cancel:[],checkout:[],manage:[]};
 const db={from(table:string){const filters:((r:any)=>boolean)[]=[];let update:object|undefined;const rows=()=>tables[table].filter(r=>filters.every(f=>f(r)));const run=()=>{const found=rows();if(update)found.forEach(r=>Object.assign(r,update));return{data:structuredClone(found),error:null};};const q={select(){return q;},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return q;},lte(){return q;},order(){return q;},limit(){return q;},update(v:object){update=v;return q;},async maybeSingle(){return{data:run().data[0]??null,error:null};},then(resolve:any,reject:any){return Promise.resolve(run()).then(resolve,reject);}};return q;},async rpc(name:string,args:any){if(name==='job_report_sync'){calls.sync.push(args);return{data:subscriber,error:null};}if(name==='job_report_initial'){calls.initial.push(args);return{data:true,error:null};}if(name==='job_report_reserve')return{data:subscriber,error:null};if(name==='job_report_request_manage'){calls.manage.push(args);return{data:true,error:null};}if(name==='job_report_claim_one'){if(delivery.claimed_until||delivery.status!=='pending')return{data:false,error:null};delivery.claimed_until=new Date(Date.now()+300000).toISOString() as any;return{data:true,error:null};}throw Error('Unexpected RPC '+name);}};
 const metadata={purpose:JOB_REPORT_PURPOSE,job_report_subscriber_id:id};
 const price={id:'price_report',active:true,product:'prod_report',currency:'usd',unit_amount:199,recurring:{interval:'month',interval_count:1}};
 const subscription:any={id:'sub_report',metadata,customer:'cus_report',created:1,livemode:false,status:'active',cancel_at_period_end:false,items:{data:[{quantity:1,price,current_period_end:Math.floor(Date.now()/1000)+86400}]},latest_invoice:{status:'paid',amount_paid:199,currency:'usd'}};
 const stripe={prices:{async retrieve(){return price;}},customers:{async retrieve(){return{id:'cus_report',metadata,email:subscriber.email};}},subscriptions:{async retrieve(){return subscription;},list(){return(async function*(){})();},async update(id:string,args:unknown){calls.cancel.push({id,args});return subscription;}},checkout:{sessions:{async create(args:unknown,opts:unknown){calls.checkout.push({args,opts});return{id:'cs_fixture',url:'https://checkout.stripe.com/fixture',customer:'cus_report',livemode:false};}}}};
 return{ctx:{db:db as unknown as SupabaseClient,stripe:stripe as unknown as Stripe,live:false} as ReportContext,subscriber,delivery,subscription,calls,price};
}
test('paid validated subscription schedules initial report; unpaid and wrong-product payments do not',async()=>{
 const h=harness();await syncReportSubscription(h.ctx,'sub_report');assert.equal(h.calls.initial.length,1);assert.ok(h.calls.sync[0].p_paid_until);
 h.subscription.latest_invoice.status='open';await syncReportSubscription(h.ctx,'sub_report');assert.equal(h.calls.initial.length,1);assert.equal(h.calls.sync[1].p_paid_until,null);
 h.subscription.items.data[0].price.id='membership_price';await assert.rejects(()=>syncReportSubscription(h.ctx,'sub_report'));assert.equal(h.calls.sync.length,2);
});
test('cancellation persists email stop and changes only dedicated newsletter subscription',async()=>{
 const h=harness();await cancelReport(h.ctx,h.subscriber.id);assert.ok(h.subscriber.unsubscribed_at);assert.deepEqual(h.calls.cancel,[{id:'sub_report',args:{cancel_at_period_end:true}}]);
 const other=harness();other.subscription.customer='cus_membership';const result=await cancelReport(other.ctx,other.subscriber.id);assert.equal(result.pending,true);assert.ok(other.subscriber.unsubscribed_at);assert.equal(other.calls.cancel.length,0);
});
test('checkout fixes amount, ownership, recurrence and stable retry parameters',async()=>{
 const h=harness();await startReportCheckout(h.ctx,h.subscriber.email);const first=h.calls.checkout[0];assert.equal(first.args.mode,'subscription');assert.deepEqual(first.args.line_items,[{price:'price_report',quantity:1}]);assert.equal(first.args.subscription_data.metadata.purpose,JOB_REPORT_PURPOSE);assert.equal(first.args.subscription_data.trial_period_days,undefined);assert.equal(first.args.payment_method_types,undefined);
 h.subscriber.checkout_session_id=null;await startReportCheckout(h.ctx,h.subscriber.email);assert.deepEqual(h.calls.checkout[1],first);
 h.price.unit_amount=1990;await assert.rejects(()=>startReportCheckout(h.ctx,h.subscriber.email));assert.equal(h.calls.checkout.length,2);
});
test('delivery retries preserve row identity, avoid accepted duplicates, and suppress unpaid/blocked recipients',async()=>{
 const h=harness();let attempts=0;
 const send=async(row:ReportDelivery)=>{attempts++;assert.equal(row.id,h.delivery.id);return attempts===1?{error:'temporary timeout'}:{id:'email_fixture'};};
 await drainReportDeliveries(h.ctx,{subscriberId:h.subscriber.id,send});assert.equal(h.delivery.status,'pending');assert.ok(h.delivery.first_attempt_at);
 await drainReportDeliveries(h.ctx,{subscriberId:h.subscriber.id,send});assert.equal(h.delivery.status,'accepted');assert.equal(attempts,2);
 await drainReportDeliveries(h.ctx,{subscriberId:h.subscriber.id,send});assert.equal(attempts,2);
 const stopped=harness();stopped.subscriber.status='canceled';await drainReportDeliveries(stopped.ctx,{subscriberId:stopped.subscriber.id,send});assert.equal(stopped.delivery.status,'suppressed');assert.equal(attempts,2);
 const blocked=harness();blocked.delivery.recipient='someone@example.org';await drainReportDeliveries(blocked.ctx,{subscriberId:blocked.subscriber.id,send});assert.equal(attempts,2);
});
test('signed unsubscribe tokens reject modification; every email has the chosen contact',()=>{
 const h=harness();const token=reportToken(h.subscriber.id);assert.equal(readReportToken(token),h.subscriber.id);assert.equal(readReportToken(token+'x'),null);
 for(const kind of ['initial','welcome','manage']){const mail=renderReportDelivery({...h.delivery,kind,payload:{...h.delivery.payload,link:'https://example.org/manage'}} as ReportDelivery)!;assert.match(mail.text,/hello@eod-hub.com/);assert.match(mail.html,/hello@eod-hub.com/);}
});
test('live beta checkout fails closed and admits only the approved email',()=>{
 delete process.env.JOB_REPORT_LIVE_TEST_ONLY;
 assert.equal(reportTestAllowed('someone@example.org',true),false);
 assert.equal(reportTestAllowed('TEST@example.org',true),true);
 process.env.JOB_REPORT_LIVE_TEST_ONLY='true';
 assert.equal(reportTestAllowed('someone@example.org',true),false);
});
