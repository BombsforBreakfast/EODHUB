import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountActor,accountBody,accountWrite } from "@/app/lib/account/server";
import { ownerBundle,bundleCheckout,confirmBundleCheckout,bundleBilling } from "@/app/lib/rentals/bundle.server";
import { loadRentalListings } from "@/app/lib/rentals/availability.server";
import { rentalFailure,rentalJson,RentalError,rentalLimit,checkDb } from "@/app/lib/rentals/portal.server";
import { rentalPortalOrigin } from "@/app/lib/rentals/origin.server";
import { rentalStripe } from "@/app/lib/rentals/billing.server";
import { randomUUID } from "node:crypto";
import { BUNDLE_TERMS,bundleInventory,bundleSelection } from "@/app/lib/rentals/bundle";
export const dynamic="force-dynamic";
async function actor(request:NextRequest){
  const a=await accountActor(request);
  if(!a.emailVerified)throw new RentalError("Verify your account email using a secure email sign-in link before opening your properties.",403);
  return {...a,bundle:await ownerBundle(a.db,a.user.id)};
}
export async function GET(request:NextRequest){try{
  const {db,bundle}=await actor(request);
  const listings=(await loadRentalListings(db)).filter(p=>bundleInventory(bundle).includes(p.id));
  if(listings.length!==bundleInventory(bundle).length)throw new RentalError("Your property inventory needs administrator review.",503);
  return rentalJson({bundle,listings});
}catch(e){return rentalFailure(e);}}
export async function POST(request:NextRequest){try{
  accountWrite(request);const {db,user,bundle}=await actor(request),body=await accountBody(request);
  await rentalLimit(db,request,`rental-bundle:${user.id}`,30);
  const origin=rentalPortalOrigin(process.env,new URL(request.url).origin);
  if(body.action==="checkout"){
    if(body.consent!==true||body.termsVersion!==BUNDLE_TERMS)throw new RentalError("Review and accept the bundle and provider terms.");
    return rentalJson({url:await bundleCheckout(db,bundle,z.boolean().parse(body.autoRenew),z.enum(["monthly","annual"]).parse(body.plan),origin,undefined,body.listingIds===undefined?bundleSelection(bundle):z.array(z.string()).min(1).max(50).parse(body.listingIds))});
  }
  if(body.action==="confirm_checkout"){
    await confirmBundleCheckout(db,bundle,z.string().regex(/^cs_/).parse(body.sessionId));return rentalJson({ok:true});
  }
  if(body.action==="cancel_checkout"){
    if(bundle.stripe_checkout_id){
      const stripe=rentalStripe(),s=await stripe.checkout.sessions.retrieve(bundle.stripe_checkout_id);
      if(s.status==="complete"){await confirmBundleCheckout(db,bundle,s.id,stripe);return rentalJson({ok:true});}
      if(s.status==="open")await stripe.checkout.sessions.expire(s.id);
    }
    checkDb((await db.from("rental_legacy_bundles").update({stripe_checkout_id:null,checkout_pending:false,checkout_attempt:randomUUID()}).eq("id",bundle.id).eq("checkout_attempt",bundle.checkout_attempt)).error);
    return rentalJson({ok:true});
  }
  if(body.action==="billing")return rentalJson({url:await bundleBilling(db,bundle,origin)});
  if(body.action==="renewal"){
    if(body.consent!==true||!bundle.stripe_subscription_id||bundle.risk_hold_until)throw new RentalError("Review your active bundle and authorize the renewal choice.");
    const enabled=z.boolean().parse(body.enabled),stripe=rentalStripe(),sub=await stripe.subscriptions.retrieve(bundle.stripe_subscription_id);
    if(sub.status!=="active"||sub.customer!==bundle.stripe_customer_id)throw new RentalError("This subscription cannot change renewal. Open Manage billing.");
    await stripe.subscriptions.update(sub.id,{metadata:{auto_renew:enabled?"true":"false"},cancel_at_period_end:!enabled});
    checkDb((await db.from("rental_legacy_bundles").update({auto_renew:enabled}).eq("id",bundle.id)).error);return rentalJson({ok:true});
  }
  if(body.action==="availability"){
    const id=z.string().parse(body.id);if(!bundleInventory(bundle).includes(id))throw new RentalError("Property does not belong to your bundle.",403);
    const status=z.enum(["available-now","pending","unavailable"]).parse(body.status),date=body.date?z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(body.date):null;
    if(date&&(!Number.isFinite(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date))throw new RentalError("Enter a valid availability date.");
    checkDb((await db.from("rental_listing_status").upsert({listing_id:id,status,projected_availability_date:date,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"listing_id"})).error);
    return rentalJson({ok:true});
  }
  throw new RentalError("Unknown bundle action.");
}catch(e){return rentalFailure(e);}}
