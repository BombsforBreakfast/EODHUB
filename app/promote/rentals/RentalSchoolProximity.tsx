import { MapPin, ArrowUpRight } from "lucide-react";
import type { RentalListing } from "@/app/lib/rentals/catalog";
import { isEglinRental, NAVSCOLEOD, rentalDirections } from "@/app/lib/rentals/locations";
import styles from "./rentals.module.css";

export default function RentalSchoolProximity({ listing }: { listing: RentalListing }) {
  if (!isEglinRental(listing)) return null;
  const miles = listing.schoolDrivingMiles;
  return <div className={styles.schoolProximity}>
    <MapPin size={17} aria-hidden="true" />
    <div><strong>{miles === undefined ? "Proximity to NAVSCOLEOD" : `About ${miles.toFixed(1)} miles driving to NAVSCOLEOD`}</strong>
      <p>{NAVSCOLEOD.address}</p>
      <small>{miles === undefined ? "Driving distance temporarily unavailable; check the route below." : "Estimated driving route via OpenStreetMap / OSRM. Confirm access, traffic, and current directions."}</small>
      <a href={rentalDirections(listing)} target="_blank" rel="noopener noreferrer">Check driving directions <ArrowUpRight size={13} /></a>
    </div>
  </div>;
}
