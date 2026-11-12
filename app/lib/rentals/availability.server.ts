import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rentalListings } from "./listings.server";
import type { RentalStatusRow } from "./availability";
import type { RentalListing } from "./catalog";

import { bundleVisible } from "./bundle";

export async function loadRentalListings(database?: SupabaseClient): Promise<RentalListing[]> {
  const db = database ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("rental_listing_status").select("listing_id,status,projected_availability_date,updated_at");
  if (error) throw new Error("Rental availability is temporarily unavailable.");
  const rows = new Map((data as RentalStatusRow[] ?? []).map(row => [row.listing_id, row]));
  return rentalListings.map(listing => {
    const row = rows.get(listing.id);
    return row ? { ...listing, availability: { status: row.status }, projectedAvailabilityDate: row.projected_availability_date ?? undefined, availabilityUpdatedAt: row.updated_at.slice(0, 10) } : listing;
  });
}

/** Only migrated partner listings gain a term gate; all other inventory is unchanged. */
export async function filterLegacyBundleTerms(listings:RentalListing[],database?:SupabaseClient){
  const db=database??createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.from("rental_legacy_bundles").select("listing_ids,paid_until,complimentary_until,risk_hold_until");
  if(error)throw new Error("Partner listing terms are temporarily unavailable.");
  const paused=new Set<string>();
  for(const b of data??[])if(!bundleVisible(b))for(const id of b.listing_ids)paused.add(id);
  return listings.filter(p=>!paused.has(p.id));
}
