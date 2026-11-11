import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "./rateLimit";
import { JOB_REPORT_PATH, JOB_REPORT_PURPOSE, JOB_REPORT_PRICE_CENTS, type ReportSubscriber } from "../jobReport";

export type ReportContext = { db: SupabaseClient; stripe: Stripe; live: boolean };
export const reportJson=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex"}});
export function reportDb(live=process.env.JOB_REPORT_MODE==="live") {
  const url=live?process.env.NEXT_PUBLIC_SUPABASE_URL:process.env.JOB_REPORT_TEST_SUPABASE_URL;
  const key=live?process.env.SUPABASE_SERVICE_ROLE_KEY:process.env.JOB_REPORT_TEST_SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error("Job Report database is not configured; tests require an isolated database");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function reportContext(): ReportContext {
  const live=process.env.JOB_REPORT_MODE==="live";
  const key=process.env.STRIPE_JOB_REPORT_SECRET_KEY||process.env.STRIPE_SUPPORT_SECRET_KEY;
  if(!["live","test"].includes(process.env.JOB_REPORT_MODE??"")||!key||!new RegExp(`^[sr]k_${live?"live":"test"}_`).test(key))throw Error("Job Report billing mode is not configured");
  if(process.env.VERCEL_ENV==="production"&&!live)throw Error("Test checkout cannot run in production");
  return {db:reportDb(live),stripe:new Stripe(key),live};
}
export function reportOrigin() {
  const origin=process.env.JOB_REPORT_SITE_URL||"https://eod-hub.com";
  const url=new URL(origin);
  if(url.origin!==origin||url.username||url.password||(url.protocol!=="https:"&&!(process.env.NODE_ENV==="development"&&url.hostname==="localhost")))throw Error("Invalid Job Report origin");
  if(process.env.VERCEL_ENV==="production"&&!["eod-hub.com","www.eod-hub.com"].includes(url.hostname))throw Error("Invalid live origin");
  return origin;
}
export function reportGuard(request:NextRequest,origin=true) {
  if(/Capacitor/i.test(request.headers.get("user-agent")??""))return reportJson({error:"The Job Report is available on the website."},403);
  if(origin&&request.headers.get("origin")!==request.nextUrl.origin)return reportJson({error:"Please open this form from EOD-HUB."},403);
  if(!checkRateLimit(`job-report:${getClientIp(request)}`,{limit:20,windowMs:60000}).allowed)return reportJson({error:"Please wait a minute and try again."},429);
}
export function reportTestAllowed(email:string,live:boolean) {
  if(live&&process.env.JOB_REPORT_LIVE_TEST_ONLY!=="true")return true;
  return (process.env.JOB_REPORT_TEST_EMAIL_ALLOWLIST??"").split(",").map(x=>x.trim().toLowerCase()).includes(email.trim().toLowerCase());
}
export function reportToken(id:string) {
  const secret=process.env.JOB_REPORT_TOKEN_SECRET;
  if(!secret||secret.length<32)throw Error("Job Report signing secret is not configured");
  const data=Buffer.from(JSON.stringify({id,purpose:"unsubscribe"})).toString("base64url");
  return `${data}.${createHmac("sha256",secret).update(data).digest("base64url")}`;
}
export function readReportToken(token:string) {
  try {
    if(token.length>1000)return null;
    const [data,signature,extra]=token.split("."); if(extra||!data||!signature)return null;
    const secret=process.env.JOB_REPORT_TOKEN_SECRET; if(!secret||secret.length<32)return null;
    const expected=createHmac("sha256",secret).update(data).digest(); const actual=Buffer.from(signature,"base64url");
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const value=JSON.parse(Buffer.from(data,"base64url").toString());
    return value.purpose==="unsubscribe"&&/^[0-9a-f-]{36}$/i.test(value.id)?value.id as string:null;
  } catch {return null;}
}
export const reportHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const stripeId=(value:string|{id:string}|null|undefined)=>typeof value==="string"?value:value?.id;
export function checkReportDb(error:{message?:string}|null) {if(error)throw Error("Job Report storage operation failed");}
export async function reportSubscriber(ctx:ReportContext,id:string) {
  const r=await ctx.db.from("job_report_subscribers").select("*").eq("id",id).eq("livemode",ctx.live).maybeSingle();checkReportDb(r.error);
  return r.data as ReportSubscriber|null;
}
export async function queueReportMail(ctx:ReportContext,s:ReportSubscriber,key:string,kind:string,payload:unknown) {
  const r=await ctx.db.from("job_report_deliveries").upsert({subscriber_id:s.id,message_key:key,kind,recipient:s.email,payload,livemode:ctx.live},{onConflict:"message_key",ignoreDuplicates:true});checkReportDb(r.error);
}
export async function requestReportManagement(ctx:ReportContext,email:string) {
  const raw=randomBytes(32).toString("base64url");
  const r=await ctx.db.rpc("job_report_request_manage",{p_email:email,p_live:ctx.live,p_hash:reportHash(raw),p_link:`${reportOrigin()}${JOB_REPORT_PATH}/manage?token=${raw}`});checkReportDb(r.error);
  return Boolean(r.data);
}
/** Dedicated customer and immutable price prevent a newsletter payment affecting membership. */
export async function startReportCheckout(ctx:ReportContext,email:string) {
  const priceId=process.env.STRIPE_JOB_REPORT_PRICE_ID;
  if(!priceId||!process.env.STRIPE_JOB_REPORT_WEBHOOK_SECRET||process.env.JOB_REPORT_ENABLED!=="true")throw Error("Job Report checkout is not enabled");
  const price=await ctx.stripe.prices.retrieve(priceId);
  if(!price.active||price.currency!=="usd"||price.unit_amount!==JOB_REPORT_PRICE_CENTS||price.recurring?.interval!=="month"||price.recurring.interval_count!==1||stripeId(price.product)!==process.env.STRIPE_JOB_REPORT_PRODUCT_ID)throw Error("Invalid Job Report price");
  let reserved=await ctx.db.rpc("job_report_reserve",{p_email:email,p_live:ctx.live});checkReportDb(reserved.error);
  let s=reserved.data as ReportSubscriber;
  if(!s.stripe_customer_id) {
    const customer=await ctx.stripe.customers.create({email,metadata:{purpose:JOB_REPORT_PURPOSE,job_report_subscriber_id:s.id}},{idempotencyKey:`job-report-customer:${s.id}`});
    const r=await ctx.db.from("job_report_subscribers").update({stripe_customer_id:customer.id}).eq("id",s.id);checkReportDb(r.error);s={...s,stripe_customer_id:customer.id};
  }
  // Check Stripe, not just the webhook cache, before offering a second subscription.
  for await(const sub of ctx.stripe.subscriptions.list({customer:s.stripe_customer_id!,status:"all",limit:100})) {
    if(sub.metadata.purpose===JOB_REPORT_PURPOSE&&!["canceled","incomplete_expired"].includes(sub.status)) {
      await requestReportManagement(ctx,email); return {manage:true};
    }
  }
  if(s.checkout_session_id) {
    const previous=await ctx.stripe.checkout.sessions.retrieve(s.checkout_session_id);
    if(previous.status==="open"&&previous.url)return {url:previous.url};
    if(previous.status==="complete"){await requestReportManagement(ctx,email);return {manage:true};}
    reserved=await ctx.db.rpc("job_report_reserve",{p_email:email,p_live:ctx.live,p_renew:true,p_expected_key:s.checkout_key});checkReportDb(reserved.error);s=reserved.data;
  }
  const suffix=Array.from(createHash("sha256").update(s.checkout_key).digest().subarray(0,8),n=>String.fromCharCode(97+n%26)).join("");
  const session=await ctx.stripe.checkout.sessions.create({mode:"subscription",customer:s.stripe_customer_id!,client_reference_id:s.id,
    line_items:[{price:priceId,quantity:1}],integration_identifier:`eodhub_job_report_${suffix}`,
    metadata:{purpose:JOB_REPORT_PURPOSE,job_report_subscriber_id:s.id},subscription_data:{billing_mode:{type:"flexible"},metadata:{purpose:JOB_REPORT_PURPOSE,job_report_subscriber_id:s.id}},
    expires_at:Math.floor(Date.parse((s as ReportSubscriber & {checkout_started_at:string}).checkout_started_at)/1000)+7200,
    success_url:`${reportOrigin()}${JOB_REPORT_PATH}/thanks?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${reportOrigin()}${JOB_REPORT_PATH}?cancelled=1`,
    custom_text:{submit:{message:"$1.99 USD today and every month until canceled. Expect 4–6 reports most weeks. No reports on days without newly approved jobs. Manage or cancel through the emailed link. Does not include or change EOD-HUB membership access."}},
  },{idempotencyKey:`job-report-checkout:${s.checkout_key}`});
  if(!session.url||session.livemode!==ctx.live||session.customer!==s.stripe_customer_id)throw Error("Invalid checkout session");
  const r=await ctx.db.from("job_report_subscribers").update({checkout_session_id:session.id}).eq("id",s.id);checkReportDb(r.error);
  return {url:session.url};
}
