import "server-only";
import { Resend } from "resend";
import { JOB_REPORT_PATH, reportApplicationUrl, reportCutoff, reportEmail, reportEligible, reportEscape, type ReportJob } from "../jobReport";
import { cancelReport, syncReportSubscription } from "./jobReportBilling";
import { checkReportDb, reportOrigin, reportSubscriber, reportTestAllowed, reportToken, type ReportContext } from "./jobReport";

export type ReportDelivery={id:string;subscriber_id:string|null;kind:string;recipient:string;payload:{date?:string;jobs?:ReportJob[];link?:string};livemode:boolean;attempts:number;first_attempt_at:string|null;expires_at:string|null;resend_message_id:string|null};
export function renderReportDelivery(row:ReportDelivery) {
  const manage=`${reportOrigin()}${JOB_REPORT_PATH}/manage`;
  const unsub=`${reportOrigin()}${JOB_REPORT_PATH}/unsubscribe?token=${encodeURIComponent(reportToken(row.subscriber_id!))}`;
  if(row.kind==="report"||row.kind==="initial") {
    const jobs=(row.payload.jobs??[]).filter(j=>reportApplicationUrl(j.applyUrl));
    if(!jobs.length)return null;
    const mail=reportEmail(jobs,row.payload.date!,manage,unsub);
    return {...mail,headers:{"List-Unsubscribe":`<${reportOrigin()}/api/job-report/unsubscribe?token=${encodeURIComponent(reportToken(row.subscriber_id!))}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}};
  }
  const link=row.kind==="manage"?row.payload.link!:manage;
  const subject=row.kind==="manage"?"Manage your Job Report subscription":"You’re subscribed to The Job Report";
  const message=row.kind==="manage"?"Use this private, one-time link within one hour to manage your payment method or cancel future renewals.":"Your $1.99/month Job Report subscription is confirmed. Today’s approved opportunities are sent separately when available. Expect 4–6 reports most weeks, depending on job availability and review activity. No filler emails. This subscription does not include or change EOD-HUB membership access.";
  return {subject,html:`<main style="font-family:Arial,sans-serif;max-width:620px;margin:32px auto;padding:24px;color:#18241d"><p style="font-weight:bold;color:#153d29">EOD-HUB / THE JOB REPORT</p><h1>${reportEscape(subject)}</h1><p style="line-height:1.6">${message}</p><a href="${reportEscape(link)}">${row.kind==="manage"?"Manage or cancel subscription":"Request a management link"}</a><p style="font-size:12px">EOD-HUB LLC<br>Contact: hello@eod-hub.com</p></main>`,text:`${subject}\n\n${message}\n\n${link}\n\nEOD-HUB LLC\nContact: hello@eod-hub.com`,headers:undefined};
}
export async function drainReportDeliveries(ctx:ReportContext,options?:{subscriberId?:string;send?:(row:ReportDelivery,mail:NonNullable<ReturnType<typeof renderReportDelivery>>)=>Promise<{id?:string;error?:string}>;deadlineMs?:number}) {
  const started=Date.now();
  const claimed=options?.subscriberId
    ? await ctx.db.from("job_report_deliveries").select("*").eq("subscriber_id",options.subscriberId).eq("status","pending").eq("livemode",ctx.live).lte("next_attempt_at",new Date().toISOString()).order("created_at").limit(5)
    : await ctx.db.rpc("job_report_claim",{p_live:ctx.live,p_limit:100});
  checkReportDb(claimed.error);let sent=0,failed=0;
  const resend=options?.send?null:new Resend(process.env.RESEND_API_KEY);
  for(const row of (claimed.data??[]) as ReportDelivery[]) {
    if(Date.now()-started>(options?.deadlineMs??43000))break;
    // A fast webhook/confirmation drain uses the same atomic lease as the worker.
    if(options?.subscriberId) {
      const lease=await ctx.db.rpc("job_report_claim_one",{p_id:row.id});checkReportDb(lease.error);if(!lease.data)continue;
    }
    const update=async(fields:Record<string,unknown>)=>{const r=await ctx.db.from("job_report_deliveries").update(fields).eq("id",row.id);checkReportDb(r.error);};
    try {
      if(!reportTestAllowed(row.recipient,ctx.live)) {await update({last_error:"Recipient not allowed during live test",next_attempt_at:new Date(Date.now()+300000).toISOString(),claimed_until:null});continue;}
      if(row.expires_at&&Date.parse(row.expires_at)<=Date.now()) {await update({status:"expired",claimed_until:null});continue;}
      if(row.first_attempt_at&&Date.now()-Date.parse(row.first_attempt_at)>=23*3600000) {await update({status:"ambiguous",last_error:"Retry paused before provider idempotency expires; reconcile delivery before resending",claimed_until:null});continue;}
      if(["report","initial"].includes(row.kind)) {
        const s=await reportSubscriber(ctx,row.subscriber_id!);
        if(!s||!reportEligible(s)||s.email!==row.recipient){await update({status:"suppressed",last_error:"No current paid email entitlement",claimed_until:null});continue;}
      }
      const mail=renderReportDelivery(row);if(!mail){await update({status:"suppressed",last_error:"No valid application links",claimed_until:null});continue;}
      await update({first_attempt_at:row.first_attempt_at??new Date().toISOString(),attempts:row.attempts+1});
      const result=options?.send?await options.send(row,mail):await (async()=>{
        const r=await resend!.emails.send({from:process.env.RESEND_FROM_EMAIL!,to:row.recipient,...mail},{idempotencyKey:`job-report-mail:${row.id}`});return {id:r.data?.id,error:r.error?.message};
      })();
      if(result.error||!result.id)throw Error(result.error??"Missing email acceptance ID");
      await update({status:"accepted",resend_message_id:result.id,sent_at:new Date().toISOString(),last_error:null,claimed_until:null});sent++;
    } catch(error) {
      failed++;
      await update({last_error:error instanceof Error?error.message:"Email delivery failed",next_attempt_at:new Date(Date.now()+Math.min(3600000,60000*2**Math.min(row.attempts,6))).toISOString(),claimed_until:null});
    }
    if(!options?.send)await new Promise(resolve=>setTimeout(resolve,350));
  }
  return {sent,failed};
}
export async function sweepReport(ctx:ReportContext) {
  // Reconcile missed webhook transitions and retry requested cancellations.
  const stale=await ctx.db.from("job_report_subscribers").select("*").eq("livemode",ctx.live).not("stripe_subscription_id","is",null).order("last_synced_at",{ascending:true,nullsFirst:true}).limit(10);checkReportDb(stale.error);
  for(const s of stale.data??[]) {
    try {if(s.unsubscribed_at&&!s.cancel_at_period_end&&!["canceled","incomplete_expired"].includes(s.status))await cancelReport(ctx,s.id);else await syncReportSubscription(ctx,s.stripe_subscription_id);}
    catch {const r=await ctx.db.from("job_report_subscribers").update({last_error:"Billing reconciliation needs retry",last_synced_at:new Date().toISOString()}).eq("id",s.id);checkReportDb(r.error);}
  }
  const prepared=await ctx.db.rpc("job_report_prepare",{p_cutoff:reportCutoff().toISOString(),p_live:ctx.live});checkReportDb(prepared.error);
  return {reportId:prepared.data,...await drainReportDeliveries(ctx)};
}
