import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { reportContext, reportGuard, reportJson, reportTestAllowed, readReportToken, reportOrigin, requestReportManagement, startReportCheckout, stripeId, checkReportDb } from "@/app/lib/server/jobReport";
import { cancelReport, reportPortal, syncReportSubscription } from "@/app/lib/server/jobReportBilling";
import { drainReportDeliveries } from "@/app/lib/server/jobReportDelivery";
import { JOB_REPORT_PATH, JOB_REPORT_PURPOSE } from "@/app/lib/jobReport";

export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:NextRequest,{params}:{params:Promise<{action:string}>}) {
  const {action}=await params;
  if(!["checkout","manage","portal","confirm","unsubscribe"].includes(action))return reportJson({error:"Not found"},404);
  const denied=reportGuard(request,action!=="unsubscribe");if(denied)return denied;
  try {
    const ctx=reportContext();
    if(action==="unsubscribe") {
      const id=readReportToken(request.nextUrl.searchParams.get("token")??"");if(!id)return reportJson({error:"Invalid unsubscribe link"},400);
      // Persist suppression before the Stripe call; the worker retries cancellation after an outage.
      const cancellation=await cancelReport(ctx,id);
      if(cancellation.pending)return reportJson({ok:true,message:"Emails are stopped. Cancellation will be retried automatically."});
      return reportJson({ok:true,message:"Job Report emails stopped and future renewals canceled. Other EOD-HUB services are unchanged."});
    }
    const form=request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
    const raw=await request.text();if(raw.length>2048)return reportJson({error:"Request too large"},413);
    const body=form?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw);
    if(action==="portal") {
      const token=z.string().max(100).parse(body.token);const session=await reportPortal(ctx,token);
      return form?new Response(null,{status:303,headers:{Location:session.url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}}):reportJson({url:session.url});
    }
    if(action==="confirm") {
      const id=z.string().startsWith("cs_").max(255).parse(body.sessionId);
      const session=await ctx.stripe.checkout.sessions.retrieve(id);
      if(session.livemode!==ctx.live||session.metadata?.purpose!==JOB_REPORT_PURPOSE)return reportJson({error:"Invalid checkout"},400);
      if(session.payment_status!=="paid"||!session.subscription)return reportJson({paid:false});
      const s=await syncReportSubscription(ctx,stripeId(session.subscription)!);
      if(!s)return reportJson({paid:false});
      await drainReportDeliveries(ctx,{subscriberId:s.id,deadlineMs:20000});
      const delivery=await ctx.db.from("job_report_deliveries").select("status,payload").eq("message_key",`initial:${s.stripe_subscription_id}`).maybeSingle();checkReportDb(delivery.error);
      return reportJson({paid:true,reportSent:["accepted","delivered"].includes(delivery.data?.status??""),jobCount:delivery.data?.payload?.jobs?.length??0});
    }
    const email=z.email().max(254).parse(String(body.email??"").trim().toLowerCase());
    if(!reportTestAllowed(email,ctx.live))return reportJson({error:"The Job Report is in a limited live test. Public subscriptions will open after validation."},403);
    if(action==="checkout") {
      const result=await startReportCheckout(ctx,email);
      if(result.manage)after(async()=>{await drainReportDeliveries(ctx);});
      return reportJson(result);
    }
    const queued=await requestReportManagement(ctx,email);
    if(queued)after(async()=>{await drainReportDeliveries(ctx);});
    return reportJson({ok:true,message:"If a Job Report subscription matches that email, a private management link is on its way."});
  } catch(error) {
    console.error("[job-report] action failed",action,error instanceof Error?error.name:"Error");
    return reportJson({error:action==="portal"?"That management link is unavailable or expired. Request a fresh link.":"The Job Report is temporarily unavailable. Please retry. No new charge is created by a management request."},action==="portal"?400:503);
  }
}
export async function GET(request:NextRequest,{params}:{params:Promise<{action:string}>}) {
  const {action}=await params;
  if(action!=="unsubscribe")return reportJson({error:"Method not allowed"},405);
  return Response.redirect(`${reportOrigin()}${JOB_REPORT_PATH}/unsubscribe?token=${encodeURIComponent(request.nextUrl.searchParams.get("token")??"")}`,303);
}
