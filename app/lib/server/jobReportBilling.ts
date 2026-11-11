import "server-only";
import type Stripe from "stripe";
import { JOB_REPORT_PURPOSE, JOB_REPORT_PRICE_CENTS, JOB_REPORT_PATH, type ReportSubscriber } from "../jobReport";
import { checkReportDb, reportHash, reportOrigin, reportSubscriber, stripeId, type ReportContext } from "./jobReport";

export async function syncReportSubscription(ctx:ReportContext,id:string) {
  const sub=await ctx.stripe.subscriptions.retrieve(id,{expand:["latest_invoice"]});
  if(sub.metadata.purpose!==JOB_REPORT_PURPOSE)return null;
  const sid=sub.metadata.job_report_subscriber_id;
  if(!/^[0-9a-f-]{36}$/i.test(sid??""))throw Error("Invalid report ownership");
  const s=await reportSubscriber(ctx,sid);if(!s)throw Error("Missing report subscriber");
  const customerId=stripeId(sub.customer);const item=sub.items.data[0];
  if(sub.livemode!==ctx.live||!customerId||s.stripe_customer_id!==customerId||sub.items.data.length!==1||item.quantity!==1||item.price.id!==process.env.STRIPE_JOB_REPORT_PRICE_ID||stripeId(item.price.product)!==process.env.STRIPE_JOB_REPORT_PRODUCT_ID||item.price.unit_amount!==JOB_REPORT_PRICE_CENTS||item.price.currency!=="usd"||item.price.recurring?.interval!=="month"||item.price.recurring.interval_count!==1)throw Error("Report subscription ownership/price mismatch");
  const customer=await ctx.stripe.customers.retrieve(customerId);if(customer.deleted||customer.metadata.purpose!==JOB_REPORT_PURPOSE||customer.metadata.job_report_subscriber_id!==s.id)throw Error("Not a standalone Job Report customer");
  const invoice=typeof sub.latest_invoice==="object"?sub.latest_invoice:null;
  const paid=invoice?.status==="paid"&&invoice.amount_paid>=JOB_REPORT_PRICE_CENTS&&invoice.currency==="usd";
  const r=await ctx.db.rpc("job_report_sync",{p_id:s.id,p_customer:customerId,p_subscription:sub.id,p_created:sub.created,p_status:sub.status,p_paid_until:paid?new Date(item.current_period_end*1000).toISOString():null,p_cancel:sub.cancel_at_period_end,p_email:customer.email??s.email});checkReportDb(r.error);
  const saved=r.data as ReportSubscriber;
  if(paid&&saved.stripe_subscription_id===sub.id) {const initial=await ctx.db.rpc("job_report_initial",{p_id:s.id});checkReportDb(initial.error);}
  return saved;
}
export async function reportPortal(ctx:ReportContext,rawToken:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(rawToken))throw Error("Invalid management link");
  const token=await ctx.db.rpc("job_report_consume_manage",{p_hash:reportHash(rawToken)});checkReportDb(token.error);
  if(!token.data)throw Error("This management link has expired or was already used. Request a new link.");
  const s=await reportSubscriber(ctx,token.data);if(!s?.stripe_customer_id)throw Error("Subscription unavailable");
  const customer=await ctx.stripe.customers.retrieve(s.stripe_customer_id);
  if(customer.deleted||customer.metadata.purpose!==JOB_REPORT_PURPOSE||customer.metadata.job_report_subscriber_id!==s.id)throw Error("Customer mismatch");
  const configuration=process.env.STRIPE_JOB_REPORT_PORTAL_CONFIGURATION_ID;if(!configuration)throw Error("Billing management is not configured");
  return ctx.stripe.billingPortal.sessions.create({customer:s.stripe_customer_id,configuration,return_url:`${reportOrigin()}${JOB_REPORT_PATH}/manage`});
}
export async function cancelReport(ctx:ReportContext,id:string) {
  const s=await reportSubscriber(ctx,id);if(!s)throw Error("Subscription unavailable");
  const r=await ctx.db.from("job_report_subscribers").update({unsubscribed_at:new Date().toISOString()}).eq("id",id);checkReportDb(r.error);
  try { if(s.stripe_subscription_id) {
    const sub=await ctx.stripe.subscriptions.retrieve(s.stripe_subscription_id);
    if(sub.metadata.purpose!==JOB_REPORT_PURPOSE||sub.metadata.job_report_subscriber_id!==s.id||stripeId(sub.customer)!==s.stripe_customer_id)throw Error("Subscription mismatch");
    if(!["canceled","incomplete_expired"].includes(sub.status))await ctx.stripe.subscriptions.update(sub.id,{cancel_at_period_end:true});
    await syncReportSubscription(ctx,sub.id);
  } } catch { return {pending:true}; }
  return {pending:false};
}
/** Only first-class subscription/customer IDs and validated product ownership reach local state. */
export async function handleReportEvent(ctx:ReportContext,event:Stripe.Event) {
  if(event.livemode!==ctx.live)throw Error("Webhook mode mismatch");
  const object=event.data.object;
  if(event.type.startsWith("checkout.session.")) {
    const session=object as Stripe.Checkout.Session;if(session.metadata?.purpose!==JOB_REPORT_PURPOSE)return;
    if(session.subscription)await syncReportSubscription(ctx,stripeId(session.subscription)!);
    return;
  }
  if(event.type.startsWith("customer.subscription.")) {await syncReportSubscription(ctx,(object as Stripe.Subscription).id);return;}
  if(event.type.startsWith("invoice.")) {
    const invoice=object as Stripe.Invoice;const id=stripeId(invoice.parent?.subscription_details?.subscription);
    if(id)await syncReportSubscription(ctx,id);return;
  }
  if(event.type==="customer.updated") {
    const customer=object as Stripe.Customer;if(customer.metadata.purpose!==JOB_REPORT_PURPOSE)return;
    const s=await reportSubscriber(ctx,customer.metadata.job_report_subscriber_id);if(s?.stripe_customer_id===customer.id&&s.stripe_subscription_id)await syncReportSubscription(ctx,s.stripe_subscription_id);return;
  }
  if(["charge.refunded","charge.dispute.created","charge.dispute.closed","radar.early_fraud_warning.created"].includes(event.type)) {
    const reference=object as unknown as {id:string;charge?:string|Stripe.Charge;actionable?:boolean;status?:string};
    if(event.type==="radar.early_fraud_warning.created"&&reference.actionable===false)return;
    const charge=await ctx.stripe.charges.retrieve(event.type==="charge.refunded"?reference.id:stripeId(reference.charge)!);
    const intent=stripeId(charge.payment_intent);if(!intent)return;
    for await(const payment of ctx.stripe.invoicePayments.list({payment:{type:"payment_intent",payment_intent:intent},limit:100})) {
      const invoice=await ctx.stripe.invoices.retrieve(stripeId(payment.invoice)!);const id=stripeId(invoice.parent?.subscription_details?.subscription);if(!id)continue;
      const s=await syncReportSubscription(ctx,id);if(!s)continue;
      // Risk events stop this email product only; a win does not clear another refund/fraud hold.
      if(event.type!=="charge.dispute.closed"||reference.status!=="won") {
        const r=await ctx.db.from("job_report_subscribers").update({risk_hold:true,last_error:`Billing review: ${event.type} (${event.id})`}).eq("id",s.id);checkReportDb(r.error);
      }
    }
  }
}
