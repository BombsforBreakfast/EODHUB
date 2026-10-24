import "server-only";
import zillowPhotos from "./zillow-photos.json";
import type { RentalListing, RentalOwner } from "./catalog";

export const rentalOwners: RentalOwner[] = [{
  id: "terry-grawey",
  name: "Terry Grawey",
  email: "terry@sipcoproducts.com",
  management: {
    company: "Rob Brooks Realty",
    realtor: "Atresia",
    phone: "850-733-6440",
    phoneHref: "+18507336440",
    email: "rentals@robbrookspropertymanagement.com",
    applicationUrl: "https://robbrooksrealty.managebuilding.com/Resident/rental-application/new",
  },
}];

export const rentalListings: RentalListing[] = [
  {
    id: "1186-muirfield-way", ownerId: "terry-grawey",
    title: "A furnished home. A pool. Room for your crew.",
    address: "1186 Muirfield Way", city: "Niceville", state: "FL", zip: "32578",
    monthlyRent: 3500, bedrooms: 3, bathrooms: 2, propertyType: "House", furnished: true,
    availability: { status: "available-now" }, availabilityUpdatedAt: "2026-10-20",
    description: "Settle into a fully furnished Niceville home with a pool and convenient access to EOD school. Terry is open to three individual renters sharing the home, ideally EOD technicians, instructors, or students in the Eglin AFB area. Ask him about individual lease arrangements and what is included.",
    highlights: ["Pool", "Fully furnished", "Roommate option"], nearby: ["EOD school", "Eglin AFB", "Bluewater Bay"],
    sharedRenters: 3,
    photos: zillowPhotos["46014945"],
  },
  {
    id: "4276-calinda-158", ownerId: "terry-grawey", contactMode: "owner-only",
    title: "Your own furnished place in Niceville.",
    address: "4276 Calinda Lane · Apt 158", city: "Niceville", state: "FL", zip: "32578",
    monthlyRent: 1650, bedrooms: 1, bathrooms: 1, propertyType: "Condo", furnished: true,
    availability: { status: "pending" }, availabilityUpdatedAt: "2026-10-24",
    description: "A fully furnished one-bedroom condo in Niceville, offered for rent directly through Terry. A place to unpack and make your own while you are in the Eglin area.",
    highlights: ["Fully furnished", "One-bedroom condo"], nearby: ["Niceville", "Eglin AFB area"],
    sourceNote: "Also offered for sale. Terry is offering this condo for rent at $1,650/month and plans to remove the sale listing if it is rented.",
    photos: zillowPhotos["71356339"],
  },
  {
    id: "4726-calinda-139", ownerId: "terry-grawey", contactMode: "owner-only",
    title: "Move in furnished. Make Niceville home.",
    address: "4726 Calinda Lane · Unit 139", city: "Niceville", state: "FL", zip: "32578",
    monthlyRent: 1650, bedrooms: 1, bathrooms: 1, propertyType: "Condo", furnished: true,
    availability: { status: "available-now" }, availabilityUpdatedAt: "2026-10-24",
    description: "A fully furnished one-bedroom condo for your next stay in Niceville. Contact Terry directly to discuss the rental, move-in timing, and lease terms.",
    highlights: ["Fully furnished", "One-bedroom condo"], nearby: ["Niceville", "Eglin AFB area"],
    sourceNote: "Also offered for sale. Terry is offering this condo for rent at $1,650/month and plans to remove the sale listing if it is rented.",
    photos: zillowPhotos["466089501"],
  },
];
