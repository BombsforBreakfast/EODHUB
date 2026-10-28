import type { NextRequest } from "next/server";
import { rentalDatabase,rentalJson,rentalFailure,checkDb } from "@/app/lib/rentals/portal.server";
import { rentalAdminEmail } from "@/app/lib/rentals/notifications.server";
import { rentalStripe, rentalBillingReady } from "@/app/lib/rentals/billing.server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return rentalJson({error:"Unauthorized"},401);
  try{
    const db=rentalDatabase(),now=new Date().toISOString();
    if(request.nextUrl.searchParams.get("check")==="1"){
      const readiness=await db.from("rental_providers").select("user_id",{head:true,count:"exact"});
      const key=process.env.STRIPE_RENTALS_SECRET_KEY||process.env.STRIPE_SECRET_KEY||"";
      return rentalJson({databaseReady:!readiness.error,billingReady:rentalBillingReady(),billingMode:key.includes("_live_")?"live":key.includes("_test_")?"test":"unconfigured",emailConfigured:!!process.env.RESEND_API_KEY,webhookConfigured:!!(process.env.STRIPE_RENTALS_SECRET_KEY?process.env.STRIPE_RENTALS_WEBHOOK_SECRET:process.env.STRIPE_WEBHOOK_SECRET)});
    }
    const due=await db.from("rental_campaigns").select("id").in("status",["live","report_due"]).is("report_alerted_at",null).lte("ends_at",now);checkDb(due.error);
    if(due.data?.length){
      checkDb((await db.from("rental_campaigns").update({status:"report_due"}).in("id",due.data.map(c=>c.id))).error);
      const sent=await rentalAdminEmail("Campaign reports due",`${due.data.length} rental campaigns have reached 30 days. Unpin the Facebook placements and upload the final reports in Admin → Rentals.`);
      if(sent)checkDb((await db.from("rental_campaigns").update({report_alerted_at:now}).in("id",due.data.map(c=>c.id))).error);
    }
    const expired=await db.from("rental_properties").select("id,stripe_subscription_id").eq("payment_status","past_due").lt("grace_until",now);checkDb(expired.error);
    for(const row of expired.data??[])if(row.stripe_subscription_id){await rentalStripe().subscriptions.cancel(row.stripe_subscription_id);checkDb((await db.from("rental_properties").update({payment_status:"canceled",auto_renew:false}).eq("id",row.id)).error);}
    checkDb((await db.from("rental_rate_limits").delete().lt("expires_at",now)).error);
    return rentalJson({ok:true,reportsDue:due.data?.length??0,expired:expired.data?.length??0});
  }catch(error){return rentalFailure(error);}
}
