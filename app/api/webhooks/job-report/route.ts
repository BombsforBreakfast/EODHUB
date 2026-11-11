import { after, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { reportContext, reportJson } from "@/app/lib/server/jobReport";
import { handleReportEvent } from "@/app/lib/server/jobReportBilling";
import { drainReportDeliveries } from "@/app/lib/server/jobReportDelivery";
import { readLimitedBody } from "@/app/lib/server/promotionRequests";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:NextRequest) {
  const signature=request.headers.get("stripe-signature");if(!signature)return reportJson({error:"Missing signature"},400);
  let event:Stripe.Event;let ctx;
  try {ctx=reportContext();event=ctx.stripe.webhooks.constructEvent(await readLimitedBody(request,262144),signature,process.env.STRIPE_JOB_REPORT_WEBHOOK_SECRET!);}
  catch {return reportJson({error:"Invalid webhook"},400);}
  try {
    await handleReportEvent(ctx,event);
    after(async()=>{try{await drainReportDeliveries(ctx);}catch{console.error("[job-report] delivery deferred to worker");}});
    return reportJson({received:true});
  } catch {return reportJson({error:"Subscription synchronization will retry"},500);}
}
