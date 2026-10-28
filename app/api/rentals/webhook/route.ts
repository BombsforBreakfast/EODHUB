import { NextRequest } from "next/server";
import Stripe from "stripe";
import { rentalDatabase, rentalFailure, rentalJson, RentalError } from "@/app/lib/rentals/portal.server";
import { handleRentalStripeEvent, rentalStripe } from "@/app/lib/rentals/billing.server";
export const runtime="nodejs";
export async function POST(request:NextRequest){
  try{
    const secret=process.env.STRIPE_RENTALS_WEBHOOK_SECRET,signature=request.headers.get("stripe-signature");
    if(!secret)throw new RentalError("Rental webhook is not configured.",503);
    if(!signature)throw new RentalError("Missing webhook signature.",400);
    let event:Stripe.Event;
    try{event=rentalStripe().webhooks.constructEvent(await request.text(),signature,secret);}catch{throw new RentalError("Invalid webhook signature or configuration.",400);}
    await handleRentalStripeEvent(rentalDatabase(),event);
    return rentalJson({received:true});
  }catch(error){return rentalFailure(error);}
}
