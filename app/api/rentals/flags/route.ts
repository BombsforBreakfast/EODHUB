import type { NextRequest } from "next/server";
import { rentalDatabase,rentalBody,rentalLimit,rentalJson,rentalFailure,checkDb,RentalError } from "@/app/lib/rentals/portal.server";
import { flagSchema } from "@/app/lib/rentals/flags";
import { engagementOwner } from "@/app/lib/rentals/analytics.server";
import { rentalListings } from "@/app/lib/rentals/listings.server";
import { OWNER_ADMIN_EMAIL } from "@/app/lib/ownerAdminAccess";
import { queueBillingEmail } from "@/app/lib/rentals/billing-notifications.server";
export async function POST(request: NextRequest) {
  try {
    if(request.headers.get("origin")!==request.nextUrl.origin)throw new RentalError("Invalid request origin.",403);
    const input=flagSchema.parse(await rentalBody(request,6000));
    if(input.website)return rentalJson({ok:true});
    const db=rentalDatabase(); await rentalLimit(db,request,"rental-flags",5,3600);
    const owner=await engagementOwner(db,"property",input.listingId);if(!owner)throw new RentalError("This listing is no longer available to report.",404);
    const legacy=rentalListings.find(p=>p.id===input.listingId);
    const property=legacy?null:await db.from("rental_properties").select("published").eq("id",input.listingId).maybeSingle();checkDb(property?.error??null);
    const listing=legacy??(property?.data?.published?{id:input.listingId,...property.data.published}:null);
    if(!listing)throw new RentalError("Listing not found.",404);
    checkDb((await db.from("rental_listing_flags").upsert({id:input.id,listing_id:listing.id,owner_id:owner,address:listing.address,city:listing.city,state:listing.state,reason:input.reason,details:input.details,contact_email:input.email},{onConflict:"id",ignoreDuplicates:true})).error);
    // One queued alert per UTC hour keeps repeated public reports from flooding
    // the durable outbox used by billing receipts. Every report remains in the queue.
    await queueBillingEmail(db,`listing-flags:${new Date().toISOString().slice(0,13)}:admin`,OWNER_ADMIN_EMAIL,"Listing reports await review","One or more visitors submitted private listing concerns. Review all current reports in Admin → Rentals → Flagged listings. A report does not hide a listing or change billing.","https://eod-hub.com/admin");
    return rentalJson({ok:true,reference:input.id});
  }catch(error){return rentalFailure(error);}
}
