import "server-only";
import { unstable_cache } from "next/cache";
import type { RentalListing } from "./catalog";
import { knownRentalLocation, parseCensusRentalLocation, rentalStreet } from "./locations";

const locateAddress = unstable_cache(async (address: string, city: string, state: string, zip: string) => {
  const query = new URLSearchParams({ street: address, city, state, zip, benchmark: "Public_AR_Current", format: "json" });
  const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/address?${query}`, { signal: AbortSignal.timeout(1500), headers: { "User-Agent": "EOD-HUB-Rentals/1.0 (+https://eod-hub.com/promote/rentals; hello@eod-hub.com)" } });
  if (!response.ok) throw new Error("Rental map geocoding unavailable");
  return parseCensusRentalLocation(await response.json(), { address, city, state, zip });
}, ["public-rental-address-location-v1"], { revalidate: 86400 });

/** Only called on the already-public, paid/approved inventory. Cache address
 * geometry, never availability, publication eligibility or provider details. */
export async function locateRentalListings(listings: RentalListing[]): Promise<RentalListing[]> {
  const result = listings.map(listing => ({ ...listing, mapLocation: knownRentalLocation(listing) }));
  const missing = result.map((listing, index) => listing.mapLocation ? -1 : index).filter(index => index >= 0);
  let cursor = 0;
  const deadline = Date.now() + 2500;
  await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
    while (cursor < missing.length && Date.now() < deadline) {
      const index = missing[cursor++], listing = result[index];
      try {
        listing.mapLocation = await locateAddress(rentalStreet(listing.address), listing.city.trim(), listing.state, listing.zip.slice(0, 5)) ?? undefined;
      } catch {
        // A map outage or unresolved address must never hide the rental itself.
      }
    }
  }));
  return result;
}
