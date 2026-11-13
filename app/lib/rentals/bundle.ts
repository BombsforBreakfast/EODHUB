export const BUNDLE_PATH = "/promote/rentals/bundle";
export const BUNDLE_TERMS = "2026-11-12-selection-v2";
export type RentalBundle = {
  id:string; owner_slug:string; user_id:string; full_name:string; email:string; listing_ids:string[];
  available_listing_ids?:string[];checkout_listing_ids?:string[];
  monthly_cents:number;plan:"monthly"|"annual";checkout_plan:"monthly"|"annual";annual_cents:number; approved_at:string; campaign_started_at:string; complimentary_until:string;
  campaign_metrics:{views?:number;clicks?:number;pageViews?:number;leases?:number;propertiesWithLeads?:number};
  stripe_product_id?:string|null;stripe_customer_id:string|null;stripe_subscription_id:string|null;stripe_checkout_id:string|null;
  checkout_attempt:string;checkout_pending:boolean;checkout_auto_renew:boolean;auto_renew:boolean;payment_status:string;paid_until:string|null;
  risk_hold_until:string|null;terms_accepted_at:string|null;terms_version:string|null;invitation_sent_at:string|null;
};
export const bundleInventory=(b:Pick<RentalBundle,"listing_ids"|"available_listing_ids">)=>b.available_listing_ids??b.listing_ids;
export const bundleSelection=(b:Pick<RentalBundle,"listing_ids"|"checkout_listing_ids">)=>b.checkout_listing_ids??b.listing_ids;
export function bundleQuote(b:Pick<RentalBundle,"listing_ids"|"available_listing_ids"|"monthly_cents"|"annual_cents">,ids:string[]){
  const inventory=bundleInventory(b);
  if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!inventory.includes(id)))throw new Error("Select at least one property from your account.");
  const all=ids.length===inventory.length;
  const monthly=all?b.monthly_cents:1000*ids.length,annual=all?b.annual_cents:10000*ids.length;
  return {monthly:{total:monthly,quantity:monthly===1000*ids.length?ids.length:1,unit:monthly===1000*ids.length?1000:monthly},annual:{total:annual,quantity:annual===10000*ids.length?ids.length:1,unit:annual===10000*ids.length?10000:annual}};
}
export function bundleListingVisible(b:Pick<RentalBundle,"listing_ids"|"available_listing_ids"|"paid_until"|"complimentary_until"|"risk_hold_until">,id:string,now=Date.now()){
  if(!bundleInventory(b).includes(id)||!bundleVisible(b,now))return false;
  return b.paid_until&&Date.parse(b.paid_until)>now?b.listing_ids.includes(id):true;
}
export function bundleVisible(b:Pick<RentalBundle,"paid_until"|"complimentary_until"|"risk_hold_until">,now=Date.now()) {
  if(b.risk_hold_until&&Date.parse(b.risk_hold_until)<=now)return false;
  return Date.parse(b.complimentary_until)>now || !!b.paid_until&&Date.parse(b.paid_until)>now;
}
export function bundleCheckoutAllowed(b:Pick<RentalBundle,"stripe_subscription_id"|"payment_status"|"paid_until"|"risk_hold_until">,now=Date.now()) {
  return !b.risk_hold_until && !(b.paid_until&&Date.parse(b.paid_until)>now) && (!b.stripe_subscription_id || ["canceled","incomplete_expired"].includes(b.payment_status));
}
export function bundleReminder(b:RentalBundle,now=Date.now()):string|null {
  if(!b.invitation_sent_at||b.risk_hold_until)return null;
  if(b.paid_until){
    const days=(Date.parse(b.paid_until)-now)/86400000;
    return b.plan==="annual"&&days>7&&days<=30?`annual:${b.paid_until}:30`:days>0&&days<=7?`annual:${b.paid_until}:7`:days<=0?`ended:${b.paid_until}`:null;
  }
  const days=(Date.parse(b.complimentary_until)-now)/86400000;
  return days<=0?"campaign-ended":days<=3?"campaign-three-days":null;
}
