import type { Metadata } from "next";
import { rentalListings, rentalOwners } from "@/app/lib/rentals/listings.server";
import { loadRentalListings } from "@/app/lib/rentals/availability.server";
import RentalDirectory from "./RentalDirectory";
import RentalsWebGate from "./RentalsWebGate";

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
  const listings = await loadRentalListings();
  return <RentalsWebGate><RentalDirectory listings={listings} owners={rentalOwners} /></RentalsWebGate>;
}
