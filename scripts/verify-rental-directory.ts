import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { availabilityLabel, getRentalManagement, rentalMatches, rentalStates } from "../app/lib/rentals/catalog";
import { rentalListings, rentalOwners } from "../app/lib/rentals/listings.server";

async function main() {
  assert.equal(rentalStates.length, 50);
  assert.equal(new Set(rentalStates.map(([code]) => code)).size, 50);
  assert.equal(new Set(rentalListings.map(listing => listing.id)).size, rentalListings.length);
  assert.deepEqual(rentalListings.map(listing => listing.monthlyRent), [3500, 1650, 1650]);
  for (const listing of rentalListings) {
    const owner = rentalOwners.find(item => item.id === listing.ownerId);
    assert.ok(owner);
    assert.ok(listing.furnished);
    assert.equal(listing.availability.status, listing.id === "4726-calinda-139" ? "pending" : "available-now");
    assert.ok(listing.photos.length > 1);
    assert.ok(listing.photos.every(photo => new URL(photo).hostname === "photos.zillowstatic.com"));
    assert.ok(owner.email.includes("@"));
    assert.equal("phone" in owner, false);
    assert.equal("phoneHref" in owner, false);
  }
  const defaults = { query: "", state: "", availability: "", ownerId: "" };
  const management = rentalOwners[0].management;
  assert.ok(management);
  assert.equal(management.company, "Rob Brooks Realty");
  assert.equal(management.realtor, "Atresia");
  assert.equal(management.phone, "850-733-6440");
  assert.equal(management.phoneHref, "+18507336440");
  assert.equal(management.email, "rentals@robbrookspropertymanagement.com");
  assert.equal(management.applicationUrl, "https://robbrooksrealty.managebuilding.com/Resident/rental-application/new");
  for (const listing of rentalListings) {
    const contact = getRentalManagement(listing, rentalOwners[0]);
    if (listing.id === "1186-muirfield-way") assert.equal(contact?.company, "Rob Brooks Realty");
    else { assert.equal(listing.contactMode, "owner-only"); assert.equal(contact, undefined); }
  }
  const matches = (filters: Partial<typeof defaults>) => rentalListings.filter(listing => rentalMatches(listing, { ...defaults, ...filters }, rentalOwners));
  assert.equal(matches({ state: "FL" }).length, 3);
  assert.equal(matches({ state: "CA" }).length, 0);
  assert.equal(matches({ query: "  eglin  " }).length, 3);
  assert.equal(matches({ query: "Florida" }).length, 3);
  assert.equal(matches({ query: "32578" }).length, 3);
  assert.equal(matches({ query: "pool" }).length, 1);
  assert.equal(matches({ ownerId: rentalOwners[0].id }).length, 3);
  assert.equal(matches({ availability: "unavailable" }).length, 0);
  assert.equal(matches({ availability: "pending" })[0]?.id, "4726-calinda-139");
  assert.equal(availabilityLabel({ status: "pending" }), "Pending");
  assert.equal(availabilityLabel({ status: "available-from", date: "2026-12-01" }), "Available Dec 1, 2026");
  assert.equal(availabilityLabel({ status: "unavailable" }), "Not currently available");
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  const { proxy } = await import("../proxy");
  const publicPage = await proxy(new NextRequest("http://localhost/promote/rentals"));
  assert.equal(publicPage.headers.get("x-middleware-next"), "1");
  assert.equal(publicPage.headers.has("x-robots-tag"), false);
  assert.equal((await proxy(new NextRequest("http://localhost/promote/rentals/example"))).headers.get("x-middleware-next"), "1");
  assert.equal((await proxy(new NextRequest("http://localhost/rentals-private"))).status, 307);
  assert.equal((await proxy(new NextRequest("http://localhost/account"))).status, 307);
  console.log("Rental directory checks passed: catalog, owner grouping, all-state filters, availability, contacts, and public route boundaries.");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
