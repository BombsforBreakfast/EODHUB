import { isEglinRental, NAVSCOLEOD } from "./locations";

export type RentalManagementContact = {
  company: string;
  realtor: string;
  phone: string;
  phoneHref: string;
  email: string;
  applicationUrl: string;
};

export type RentalOwner = {
  id: string;
  name: string;
  email: string;
  management?: RentalManagementContact;
};

export type RentalAvailability =
  | { status: "available-now" }
  | { status: "available-from"; date: string }
  | { status: "pending" }
  | { status: "unavailable" };

export type RentalListing = {
  id: string;
  ownerId: string;
  contactMode?: "owner-only";
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  monthlyRent: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: "House" | "Condo" | "Apartment" | "Room" | "Shared home" | "Short-term rental";
  furnished: boolean;
  availability: RentalAvailability;
  availabilityUpdatedAt: string;
  projectedAvailabilityDate?: string;
  description: string;
  highlights: string[];
  nearby: string[];
  sharedRenters?: number;
  sourceNote?: string;
  photos: string[];
  rentPeriod?: "month" | "week" | "night";
  priceBasis?: "property" | "room";
  portalListing?: boolean;
  mapLocation?: { latitude: number; longitude: number; source: "census"; matchedAddress: string };
  providerContact?: {name:string;phone:string;email:string;company:string};
  rentalTerms?: {minimumLeaseMonths:number;deposit:number;fees:string;utilities:string;petDetails:string};
};

export const rentalStates = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

export function availabilityLabel(availability: RentalAvailability) {
  if (availability.status === "available-now") return "Available now";
  if (availability.status === "pending") return "Pending";
  if (availability.status === "unavailable") return "Not currently available";
  return `Available ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${availability.date}T00:00:00Z`))}`;
}

export function getRentalManagement(listing: RentalListing, owner: RentalOwner) {
  return listing.contactMode === "owner-only" ? undefined : owner.management;
}

export function rentalMatches(listing: RentalListing, filters: { query: string; state: string; availability: string; ownerId: string }, owners: RentalOwner[]) {
  const query = filters.query.trim().toLowerCase();
  const owner = owners.find(item => item.id === listing.ownerId);
  const stateName = rentalStates.find(([code]) => code === listing.state)?.[1] ?? listing.state;
  const school = isEglinRental(listing) ? `${NAVSCOLEOD.name} ${NAVSCOLEOD.fullName} ${NAVSCOLEOD.address}` : "";
  const search = [listing.title, listing.address, listing.city, listing.state, stateName, listing.zip, ...listing.nearby, ...listing.highlights, owner?.name, school].join(" ").toLowerCase();
  return (!query || search.includes(query)) && (!filters.state || listing.state === filters.state) &&
    (!filters.availability || listing.availability.status === filters.availability) &&
    (!filters.ownerId || listing.ownerId === filters.ownerId);
}
