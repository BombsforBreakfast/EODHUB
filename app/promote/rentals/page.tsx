import type { Metadata } from "next";
import { rentalListings, rentalOwners } from "@/app/lib/rentals/listings.server";
import { loadRentalListings } from "@/app/lib/rentals/availability.server";
import RentalDirectory from "./RentalDirectory";
import RentalsWebGate from "./RentalsWebGate";
import { publishedRentalInventory } from "@/app/lib/rentals/published.server";
import { locateRentalListings } from "@/app/lib/rentals/locations.server";
import { filterModeratedRentals } from "@/app/lib/rentals/moderation.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Rentals for the EOD community | EOD-HUB",
  description: "Niceville rentals near Eglin AFB and EOD school. Explore the homes and contact the owner directly. No account required.",
  alternates: { canonical: "https://eod-hub.com/promote/rentals" },
  openGraph: {
    title: "Your next assignment. Your next place. | EOD-HUB Rentals",
    description: "Explore Niceville rentals near Eglin AFB and EOD school, including a pool home with a three-way rent option and two condos.",
    url: "https://eod-hub.com/promote/rentals",
    type: "website",
    images: [{ url: rentalListings[0].photos[0], alt: rentalListings[0].address }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function RentalsPage() {
  const [listings, inventory] = await Promise.all([loadRentalListings(),publishedRentalInventory()]);
  const moderated = await filterModeratedRentals([...listings, ...inventory.listings]);
  const mappedListings = await locateRentalListings(moderated.listings);
  return <RentalsWebGate>{inventory.unavailable||moderated.unavailable?<p role="status" style={{textAlign:"center",padding:"12px 20px",fontSize:13}}>{moderated.unavailable?"Rental listings are temporarily unavailable.":"Additional rental inventory is temporarily unavailable."} Please try again shortly.</p>:null}<RentalDirectory listings={mappedListings} owners={[...rentalOwners,...inventory.owners]} showFilters showStateFilter /></RentalsWebGate>;
}
