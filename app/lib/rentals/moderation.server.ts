import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RentalListing } from "./catalog";
import { rentalDatabase, RentalError } from "./portal.server";
export async function rentalModerationHold(db: SupabaseClient, listingId: string) {
  const { data, error } = await db.from("rental_listing_moderation").select("hidden").eq("listing_id",listingId).maybeSingle();
  if (error) throw new RentalError("Listing review status is temporarily unavailable.",503);
  return data?.hidden === true;
}
export async function filterModeratedRentals(listings: RentalListing[], database?: SupabaseClient) {
  const db = database ?? rentalDatabase();
  const hidden = new Set<string>();
  // One row per ID and <=100 IDs per query prevents both URL overflow and
  // silent default-row-limit truncation from restoring a held listing.
  for(let offset=0;offset<listings.length;offset+=100){
    const {data,error}=await db.from("rental_listing_moderation").select("listing_id").in("listing_id",listings.slice(offset,offset+100).map(p=>p.id)).eq("hidden",true);
    if(error)return {listings:[] as RentalListing[],unavailable:true};
    for(const row of data??[])hidden.add(row.listing_id);
  }
  return { listings: listings.filter(p=>!hidden.has(p.id)), unavailable: false };
}
