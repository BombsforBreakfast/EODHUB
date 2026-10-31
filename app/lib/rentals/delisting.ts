import type Stripe from "stripe";
export type Delisting = {id:string;listing_id:string;provider_id:string;label:string;plan:"monthly"|"annual"|"legacy";reason:string;effective_at:string;state:"pending"|"refund_due"|"manual_review"|"completed";subscription_id:string|null;invoice_id:string|null;refund_cents:number|null;refunded_cents:number;refund_id:string|null;result_note:string|null;last_error:string|null};
export function annualUnusedRefund(line:Pick<Stripe.InvoiceLineItem,"amount"|"discount_amounts"|"taxes"|"period">,effectiveMs:number){
  const start=line.period.start*1000,end=line.period.end*1000,days=(end-start)/86400000;
  if(!Number.isFinite(days)||days<300||days>370)throw new Error("Review the annual billing period in Stripe.");
  const unused=Math.min(days,Math.max(0,Math.floor((end-effectiveMs)/86400000)));
  const base=Math.max(0,line.amount-(line.discount_amounts??[]).reduce((n,d)=>n+d.amount,0));
  const tax=(line.taxes??[]).filter(t=>t.tax_behavior!=="inclusive").reduce((n,t)=>n+t.amount,0);
  return Math.round((base+tax)*unused/days);
}
