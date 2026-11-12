import { NextRequest } from "next/server";
import Stripe from "stripe";
import { rentalDatabase, rentalFailure, rentalJson, RentalError } from "@/app/lib/rentals/portal.server";
import { handleRentalStripeEvent, rentalStripe } from "@/app/lib/rentals/billing.server";
import { bundleStripeEvent } from "@/app/lib/rentals/bundle.server";
import { drainBillingEmails } from "@/app/lib/rentals/billing-notifications.server";
export const runtime="nodejs";
export async function POST(request:NextRequest){
  try{
    const secret=process.env.STRIPE_RENTALS_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature");
    if(!secret)throw new RentalError("Rental webhook is not configured.",503);
    if(!signature)throw new RentalError("Missing webhook signature.",400);
    let event:Stripe.Event;
    try{event=rentalStripe().webhooks.constructEvent(await request.text(),signature,secret);}catch{throw new RentalError("Invalid webhook signature or configuration.",400);}
    const db=rentalDatabase();
    if(!await bundleStripeEvent(db,event))await handleRentalStripeEvent(db,event);
    await drainBillingEmails(db);
    return rentalJson({received:true});
  }catch(error){return rentalFailure(error);}
}
