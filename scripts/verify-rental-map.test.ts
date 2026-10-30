import test from "node:test";
import assert from "node:assert/strict";
import type { RentalListing } from "../app/lib/rentals/catalog";
import { rentalMatches } from "../app/lib/rentals/catalog";
import { distanceMiles, isEglinRental, knownRentalLocation, NAVSCOLEOD, navscoleodMiles, parseCensusRentalLocation, rentalDirections, rentalLocation, rentalMapGroups, rentalStreet } from "../app/lib/rentals/locations";

const listing = (id: string, address = "4276 Calinda Lane · Apt 158", state = "FL"): RentalListing => ({ id, address, city: "Niceville", state, zip: "32578", ownerId: "owner", title: "Rental", monthlyRent: 1650, bedrooms: 1, bathrooms: 1, propertyType: "Condo", furnished: true, availability: { status: "pending" }, availabilityUpdatedAt: "2026-10-30", description: "Owner-provided listing", highlights: [], nearby: ["Eglin AFB"], photos: [] });

test("verified address seeds handle unit labels without changing the display address", () => {
  const rental = listing("a");
  assert.equal(rentalStreet(rental.address), "4276 Calinda Lane");
  assert.equal(rental.address, "4276 Calinda Lane · Apt 158");
  assert.equal(knownRentalLocation(rental)?.longitude, -86.434713527578);
  assert.equal(knownRentalLocation({ ...rental, address: "4276 CALINDA LN, Unit 139" })?.latitude, knownRentalLocation(rental)?.latitude);
  assert.equal(knownRentalLocation(listing("unverified", "4726 Calinda Lane · Unit 139")), undefined);
  assert.equal(knownRentalLocation({ ...rental, zip: "12345" }), undefined);
  assert.equal(knownRentalLocation({ ...rental, city: "Another city" }), undefined);
});

test("Census results must be unique and match the actual street, state and ZIP", () => {
  const rental = listing("a");
  const match = { coordinates: { x: -86.4347, y: 30.4966 }, matchedAddress: "4276 CALINDA LN, NICEVILLE, FL, 32578", addressComponents: { state: "FL", zip: "32578" } };
  const response = (matches: unknown[]) => ({ result: { addressMatches: matches } });
  assert.equal(parseCensusRentalLocation(response([match]), rental)?.longitude, match.coordinates.x);
  assert.equal(parseCensusRentalLocation(response([]), rental), null);
  assert.equal(parseCensusRentalLocation(response([match, match]), rental), null);
  assert.equal(parseCensusRentalLocation(response([{ ...match, matchedAddress: "4726 CALINDA LN, NICEVILLE, FL, 32578" }]), rental), null);
  assert.equal(parseCensusRentalLocation(response([{ ...match, addressComponents: { state: "CA", zip: "32578" } }]), rental), null);
  assert.equal(parseCensusRentalLocation(response([{ ...match, addressComponents: { state: "FL", zip: "32579" } }]), rental), null);
  assert.equal(parseCensusRentalLocation(response([{ ...match, coordinates: { x: 500, y: 95 } }]), rental), null);
  assert.equal(parseCensusRentalLocation({ result: { addressMatches: "bad data" } }, rental), null);
});

test("school proximity uses real coordinates and never invents missing distances", () => {
  assert.equal(NAVSCOLEOD.address, "8840 Range Rd, Niceville, FL 32578");
  assert.equal(distanceMiles(NAVSCOLEOD, NAVSCOLEOD), 0);
  assert.ok(Math.abs(distanceMiles({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 69.09) < .1);
  const rental = listing("a");
  assert.ok(navscoleodMiles(rental)! > 3 && navscoleodMiles(rental)! < 4);
  assert.equal(navscoleodMiles(listing("unknown", "Unknown road")), undefined);
  assert.equal(isEglinRental({ ...rental, city: "Tampa", nearby: [], address: "Unknown road" }), false);
  assert.equal(navscoleodMiles({ ...rental, state: "VA" }), undefined);
  assert.equal(rentalLocation({ ...rental, mapLocation: { source: "census", matchedAddress: "bad", latitude: NaN, longitude: Infinity } }), undefined);
});

test("co-located condo units share a pin and retain separate listings and availability", () => {
  const rentals = [listing("pending"), { ...listing("available", "4276 Calinda Lane · Unit 139"), availability: { status: "available-now" as const } }, listing("house", "1186 Muirfield Way"), listing("unmapped", "Unknown road")];
  const groups = rentalMapGroups(rentals);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].listings.map(rental => rental.id), ["pending", "available"]);
  const filtered = rentals.filter(rental => rentalMatches(rental, { query: "", state: "FL", availability: "pending", ownerId: "" }, []));
  assert.equal(rentalMapGroups(filtered)[0].listings.length, 1);
  assert.equal(rentals.length, 4, "Unmapped inventory remains available to List view");
});

test("directions preserve the rental origin and the requested school destination", () => {
  const rental = listing("a");
  const url = new URL(rentalDirections(rental));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("travelmode"), "driving");
  assert.equal(url.searchParams.get("destination"), NAVSCOLEOD.address);
  assert.equal(url.searchParams.get("origin"), "4276 Calinda Lane, Niceville, FL 32578");
  assert.equal(new URL(rentalDirections()).searchParams.has("origin"), false);
});

test("school-name searches include Eglin rentals without including unrelated locations", () => {
  const filters = { query: "NAVSCOLEOD", state: "", availability: "", ownerId: "" };
  assert.equal(rentalMatches(listing("near-school"), filters, []), true);
  assert.equal(rentalMatches({ ...listing("elsewhere", "Unknown road"), city: "Tampa", nearby: [] }, filters, []), false);
});
