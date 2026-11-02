import { isSupportAmount } from "./hubSupport";
export type SupportFrequency = "one_time" | "monthly";
export type SupportSubscription = {
  id:string;amount_cents:number;livemode:boolean;stripe_subscription_id:string|null;stripe_customer_id:string|null;
  email_hash:string|null;status:string;current_period_end:string|null;cancel_at_period_end:boolean;created_at:string;
  stripe_product_id:string;
};
export function monthlySupportReady(env:Record<string,string|undefined> = process.env) {
  return env.HUB_SUPPORT_MONTHLY_ENABLED === "true" && !!env.STRIPE_SUPPORT_MONTHLY_PRODUCT_ID?.startsWith("prod_") &&
    !!env.STRIPE_SUPPORT_PORTAL_CONFIGURATION_ID?.startsWith("bpc_") && !!env.RESEND_API_KEY && !!env.RESEND_FROM_EMAIL &&
    !!env.STRIPE_SUPPORT_WEBHOOK_SECRET && !!env.HUB_SUPPORT_RATE_SECRET && (env.HUB_SUPPORT_MANAGE_SECRET?.length??0)>=32;
}
export function supportNetCents(row:{amount_cents:number;refunded_cents?:number|null;disputed_cents?:number|null}) {
  return Math.max(0,row.amount_cents-(row.refunded_cents??0)-(row.disputed_cents??0));
}
export function validSupportPortal(configuration: { active: boolean; features: { customer_update: {enabled: boolean}; subscription_update: {enabled: boolean}; invoice_history: {enabled: boolean}; payment_method_update: {enabled: boolean}; subscription_cancel: {enabled: boolean; mode: string} }; login_page?: {enabled: boolean} }) {
  const f = configuration.features;
  return configuration.active && !f.customer_update.enabled && !f.subscription_update.enabled && f.invoice_history.enabled && f.payment_method_update.enabled && f.subscription_cancel.enabled && f.subscription_cancel.mode === "at_period_end" && !configuration.login_page?.enabled;
}
/** A support subscription has one monthly USD item and no unrelated purchases. */
export function validMonthlyItem(items:Array<{quantity?:number|null;price:{currency:string;unit_amount:number|null;product:string|{id:string};recurring?:{interval:string;interval_count:number}|null}}>,productId:string,amount:number) {
  return isSupportAmount(amount)&&items.length===1&&items[0].quantity===1&&items[0].price.currency==="usd"&&items[0].price.unit_amount===amount&&
    (typeof items[0].price.product==="string"?items[0].price.product:items[0].price.product.id)===productId&&items[0].price.recurring?.interval==="month"&&items[0].price.recurring.interval_count===1;
}
