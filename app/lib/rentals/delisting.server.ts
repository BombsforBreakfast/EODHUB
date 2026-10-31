import "server-only";
import type Stripe from "stripe";
import type {SupabaseClient} from "@supabase/supabase-js";
import {annualUnusedRefund,type Delisting} from "./delisting";
import {checkDb,RentalError} from "./portal.server";
import {rentalStripe} from "./billing.server";
import {queueBillingEmail} from "./billing-notifications.server";
import {OWNER_ADMIN_EMAIL} from "../ownerAdminAccess";

export async function processDelisting(db:SupabaseClient,job:Delisting,override?:Stripe){
  if(job.state!=="pending")return;
  try{
    if(job.plan==="legacy"){
      checkDb((await db.from("rental_delistings").update({state:"manual_review",result_note:"Original catalog listing: review any billing handled outside the provider portal."}).eq("id",job.id)).error);await queueBillingEmail(db,`delisted:${job.id}:admin`,OWNER_ADMIN_EMAIL,"Original rental delisted — billing review",`${job.label} was removed. Review any outside billing and unused annual time in Delisting & refunds.`,"https://eod-hub.com/admin");return;
    }
    const record=await db.from("rental_properties").select("*").eq("id",job.listing_id).single();checkDb(record.error);const row=record.data;
    if(!row||String(row.provider_id)!==job.provider_id||!row.delisted_at)throw new RentalError("Delisting ownership mismatch.");
    let invoiceId:string|null=null,refund=0,manual=false;
    if(row.stripe_subscription_id){
      const stripe=override??rentalStripe(),sub=await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      if(sub.metadata.billing_subject!=="eod_rental_property"||sub.metadata.rental_property_id!==row.id||sub.metadata.rental_provider_id!==row.provider_id)throw new RentalError("Subscription ownership mismatch.");
      if(!["canceled","incomplete_expired"].includes(sub.status))await stripe.subscriptions.cancel(sub.id,{prorate:false,invoice_now:false});
      checkDb((await db.from("rental_properties").update({payment_status:"canceled",auto_renew:false,payment_url:null}).eq("id",row.id)).error);
      checkDb((await db.from("rental_delistings").update({subscription_id:sub.id,last_error:null}).eq("id",job.id)).error);
      if(job.plan==="annual"){
        const risk=await db.from("rental_billing_cases").select("id").eq("property_id",row.id).in("kind",["refund","dispute","fraud_warning"]).limit(1);checkDb(risk.error);manual=!!risk.data?.length;
        for await(const invoice of stripe.invoices.list({subscription:sub.id,status:"paid",limit:100})){
          const source=invoice.parent?.subscription_details?.subscription;
          if((typeof source==="string"?source:source?.id)!==sub.id)continue;
          for await(const line of stripe.invoices.listLineItems(invoice.id,{limit:100})){
            const item=line.parent?.subscription_item_details;
            if(!item||item.proration||!sub.items.data.some(i=>i.id===item.subscription_item&&i.price.recurring?.interval==="year"))continue;
            if(line.period.end*1000<=Date.parse(job.effective_at))continue;
            invoiceId=invoice.id;
            if(invoice.currency!=="usd"||invoice.amount_paid!==invoice.total||invoice.post_payment_credit_notes_amount||invoice.pre_payment_credit_notes_amount){manual=true;break;}
            try{refund=Math.min(invoice.amount_paid,annualUnusedRefund(line,Date.parse(job.effective_at)));}catch{manual=true;}break;
          }
          if(invoiceId)break;
        }
      }
    }
    if(job.plan==="annual"&&!invoiceId&&row.paid_until&&Date.parse(row.paid_until)>Date.parse(job.effective_at))manual=true;
    const state=manual?"manual_review":refund>0?"refund_due":"completed";
    checkDb((await db.from("rental_delistings").update({state,invoice_id:invoiceId,refund_cents:manual?null:refund,last_error:null,result_note:manual?"Review earlier refunds, disputes, credits or adjustments in Stripe before issuing any further refund.":refund>0?"Issue this cash refund against the linked paid invoice in Stripe, then record its reference here.":"Future listing billing stopped. No unused paid annual balance was identified.",completed_at:state==="completed"?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",job.id)).error);
    const provider=await db.from("rental_providers").select("email").eq("user_id",row.provider_id).single();checkDb(provider.error);
    if(provider.data)await queueBillingEmail(db,`delisted:${job.id}:provider`,provider.data.email,"Listing delisted — future billing stopped",`${job.label}\n\nThis listing has been delisted. Future listing billing has stopped. ${job.plan==="monthly"?"The current paid monthly listing fee is retained.":refund>0&&!manual?`A refund of $${(refund/100).toFixed(2)} for unused annual listing time is due and will be issued through Stripe. We will email confirmation when it is recorded.`:manual?"Your remaining annual payment is under refund review, including any prior refunds or disputes.":"There is no unused paid annual balance to refund."}\n\nReason: ${job.reason}`);
    await queueBillingEmail(db,`delisted:${job.id}:admin`,OWNER_ADMIN_EMAIL,"Confirmed delisting billing update",`${job.label}\nFuture billing stopped. ${state==="completed"?"Billing review complete.":"An annual cash refund/review task needs your attention in Admin → Rentals → Delisting & refunds."}`,"https://eod-hub.com/admin");
  }catch(e){
    checkDb((await db.from("rental_delistings").update({state:"pending",last_error:e instanceof Error?e.message:"Cancellation needs retry",updated_at:new Date().toISOString()}).eq("id",job.id)).error);
    await queueBillingEmail(db,`delisted:${job.id}:retry`,OWNER_ADMIN_EMAIL,"Delisting cancellation needs attention",`${job.label}\nThe property is hidden, but subscription cancellation needs retry. Review Delisting & refunds immediately to ensure no further renewal charges.`,"https://eod-hub.com/admin");
  }
}
export async function confirmDelisting(db:SupabaseClient,scope:"property"|"provider",target:string,note:string,actor:string|null,legacy?:{ownerId:string;address:string}){
  const result=await db.rpc("rental_confirm_delisting",{p_scope:scope,p_target:target,p_reason:note,p_actor:actor,p_legacy_owner:legacy?.ownerId??"",p_legacy_label:legacy?.address??""});checkDb(result.error);
  for(const job of (result.data??[]) as Delisting[])await processDelisting(db,job);
  return result.data;
}
