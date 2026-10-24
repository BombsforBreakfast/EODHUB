import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rentalListings } from "./listings.server";
import type { RentalStatusRow } from "./availability";
import type { RentalListing } from "./catalog";

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
