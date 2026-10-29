import type { NextRequest } from "next/server";
import { rentalDatabase,rentalJson,rentalFailure,checkDb } from "@/app/lib/rentals/portal.server";
import { rentalAdminEmail } from "@/app/lib/rentals/notifications.server";
import { rentalStripe, rentalBillingReady, syncRentalSubscription } from "@/app/lib/rentals/billing.server";
import { annualReminderEmail,drainBillingEmails,expireBillingCase,openBillingCase } from "@/app/lib/rentals/billing-notifications.server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return rentalJson({error:"Unauthorized"},401);
  try{
    const db=rentalDatabase(),now=new Date().toISOString();
    if(request.nextUrl.searchParams.get("check")==="1"){
      const readiness=await db.from("rental_providers").select("user_id",{head:true,count:"exact"});
      const [cases,emails,history]=await Promise.all([db.from("rental_billing_cases").select("id",{head:true,count:"exact"}),db.from("rental_billing_emails").select("id",{head:true,count:"exact"}).is("sent_at",null),db.from("rental_subscription_history").select("subscription_id",{head:true,count:"exact"})]);
      let invoicePaymentsReadable:boolean|undefined;
      if(request.nextUrl.searchParams.get("permissions")==="1"){
        try{await rentalStripe().invoicePayments.list({limit:1});invoicePaymentsReadable=true;}catch{invoicePaymentsReadable=false;}
      }
      const key=process.env.STRIPE_RENTALS_SECRET_KEY||process.env.STRIPE_SECRET_KEY||"";
      return rentalJson({databaseReady:!readiness.error,billingLifecycleReady:!cases.error&&!emails.error&&!history.error,pendingBillingEmails:emails.count,invoicePaymentsReadable,taxCollectionEnabled:process.env.STRIPE_RENTALS_AUTOMATIC_TAX==="true",billingReady:rentalBillingReady(),billingMode:key.includes("_live_")?"live":key.includes("_test_")?"test":"unconfigured",emailConfigured:!!process.env.RESEND_API_KEY,webhookConfigured:!!(process.env.STRIPE_RENTALS_SECRET_KEY?process.env.STRIPE_RENTALS_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET)});
    }
    const due=await db.from("rental_campaigns").select("id").in("status",["live","report_due"]).is("report_alerted_at",null).lte("ends_at",now);checkDb(due.error);
    if(due.data?.length){
      checkDb((await db.from("rental_campaigns").update({status:"report_due"}).in("id",due.data.map(c=>c.id))).error);
      const sent=await rentalAdminEmail("Campaign reports due",`${due.data.length} rental campaigns have reached 30 days. Unpin the Facebook placements and upload the final reports in Admin → Rentals.`);
      if(sent)checkDb((await db.from("rental_campaigns").update({report_alerted_at:now}).in("id",due.data.map(c=>c.id))).error);
    }
    const annual=await db.from("rental_properties").select("*").eq("plan","annual").gt("paid_until",now).lte("paid_until",new Date(Date.now()+30*86400000).toISOString());checkDb(annual.error);
    for(const row of annual.data??[])await annualReminderEmail(db,row);
    // Reconcile ended terms even if a webhook was delayed. Grace is anchored to
    // the original paid-through date, so job retries never extend the window.
    const ended=await db.from("rental_properties").select("*").in("payment_status",["canceled","unpaid"]).lte("paid_until",now);checkDb(ended.error);
    for(const row of ended.data??[])if(row.stripe_subscription_id){
      const cases=await db.from("rental_billing_cases").select("id").eq("property_id",row.id).neq("status","resolved").limit(1);checkDb(cases.error);
      if(!cases.data?.length)await openBillingCase(db,row,{incident_key:`term:${row.stripe_subscription_id}:${row.paid_until}`,kind:"term_ended",stripe_object_id:row.stripe_subscription_id,subscription_id:row.stripe_subscription_id,detail:"Your paid term has ended. Open the portal to review billing or submit a new listing term.",started:Date.parse(row.paid_until)});
    }
    const expired=await db.from("rental_billing_cases").select("*").eq("status","open").lte("deadline",now);checkDb(expired.error);
    for(const issue of expired.data??[]){
      const stripe=rentalStripe();
      if(["payment_failed","payment_stopped"].includes(issue.kind))await syncRentalSubscription(db,await stripe.subscriptions.retrieve(issue.subscription_id,{expand:["latest_invoice"]}),stripe);
      await expireBillingCase(db,issue,stripe);
    }
    const emailDelivery=await drainBillingEmails(db);
    checkDb((await db.from("rental_rate_limits").delete().lt("expires_at",now)).error);
    return rentalJson({ok:true,reportsDue:due.data?.length??0,expired:expired.data?.length??0,emailDelivery});
  }catch(error){return rentalFailure(error);}
}
