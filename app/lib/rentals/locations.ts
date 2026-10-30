import type { RentalListing } from "./catalog";

export const NAVSCOLEOD = {
  name: "NAVSCOLEOD",
  fullName: "Naval School Explosive Ordnance Disposal",
  address: "8840 Range Rd, Niceville, FL 32578",
  latitude: 30.500402450561523,
  longitude: -86.37395477294922,
  source: "https://www.netc.navy.mil/Commands/Center-for-Explosive-Ordnance-Disposal-and-Diving/Naval-School-Explosive-Ordnance-Disposal/Contact-Us/",
} as const;

type RentalAddress = Pick<RentalListing, "address" | "city" | "state" | "zip">;
export type RentalMapLocation = NonNullable<RentalListing["mapLocation"]>;

/** Unit labels share a building location. Preserve the original display address. */
export function rentalStreet(address: string) {
  return address.split(/[·#]/)[0].replace(/,\s*(?:apt|apartment|unit|suite|ste)\b.*$/i, "").replace(/\s+(?:apt|apartment|unit|suite|ste)\.?\s+\d[\w-]*$/i, "").trim();
}

function normalizedStreet(address: string) {
  const aliases: Record<string, string> = { STREET: "ST", ROAD: "RD", LANE: "LN", AVENUE: "AVE", DRIVE: "DR", COURT: "CT", BOULEVARD: "BLVD", CIRCLE: "CIR", PLACE: "PL", TERRACE: "TER", HIGHWAY: "HWY", PARKWAY: "PKWY", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };
  return rentalStreet(address).toUpperCase().replace(/[.,]/g, "").split(/\s+/).map(word => aliases[word] ?? word).join(" ");
}

function addressKey(listing: RentalAddress) {
  return [normalizedStreet(listing.address), listing.city.trim().toUpperCase(), listing.state, listing.zip.slice(0, 5)].join("|");
}

// Census Public_AR_Current results, verified 2026-10-30. These are calculated
// street-range coordinates, not surveyed building entrances or unit locations.
const knownLocations: Record<string, RentalMapLocation> = {
  "1186 MUIRFIELD WAY|NICEVILLE|FL|32578": { latitude: 30.47523590059, longitude: -86.429158644205, source: "census", matchedAddress: "1186 MUIRFIELD WAY, NICEVILLE, FL, 32578" },
  "4276 CALINDA LN|NICEVILLE|FL|32578": { latitude: 30.496597281447, longitude: -86.434713527578, source: "census", matchedAddress: "4276 CALINDA LN, NICEVILLE, FL, 32578" },
};

export function knownRentalLocation(listing: RentalAddress): RentalMapLocation | undefined {
  return knownLocations[addressKey(listing)];
}

export function validRentalPoint(point: { latitude: number; longitude: number } | undefined): point is { latitude: number; longitude: number } {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 85 && Math.abs(point.longitude) <= 180;
}

export function rentalLocation(listing: RentalListing) {
  const point = listing.mapLocation ?? knownRentalLocation(listing);
  return validRentalPoint(point) ? point : undefined;
}

const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;

/** Reject ambiguous matches and any changed street, state or ZIP. */
export function parseCensusRentalLocation(payload: unknown, listing: RentalAddress): RentalMapLocation | null {
  const matches = object(object(payload)?.result)?.addressMatches;
  if (!Array.isArray(matches) || matches.length !== 1) return null;
  const match = object(matches[0]), coordinates = object(match?.coordinates), parts = object(match?.addressComponents);
  if (typeof match?.matchedAddress !== "string" || typeof coordinates?.x !== "number" || typeof coordinates?.y !== "number") return null;
  if (parts?.state !== listing.state || parts?.zip !== listing.zip.slice(0, 5) || normalizedStreet(match.matchedAddress.split(",")[0]) !== normalizedStreet(listing.address)) return null;
  const point: RentalMapLocation = { latitude: coordinates.y, longitude: coordinates.x, source: "census", matchedAddress: match.matchedAddress };
  return validRentalPoint(point) ? point : null;
}

export function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude), dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function isEglinRental(listing: RentalListing) {
  if (listing.state !== "FL") return false;
  const point = rentalLocation(listing);
  return /niceville/i.test(listing.city) || listing.nearby.some(place => /eglin|navscoleod|eod school/i.test(place)) || !!point && distanceMiles(point, NAVSCOLEOD) <= 50;
}

export function navscoleodMiles(listing: RentalListing) {
  const point = rentalLocation(listing);
  return isEglinRental(listing) && point ? Math.round(distanceMiles(point, NAVSCOLEOD) * 10) / 10 : undefined;
}

export function rentalDirections(listing?: RentalAddress) {
  const query = new URLSearchParams({ api: "1", destination: NAVSCOLEOD.address, travelmode: "driving" });
  if (listing) query.set("origin", `${rentalStreet(listing.address)}, ${listing.city}, ${listing.state} ${listing.zip}`);
  return `https://www.google.com/maps/dir/?${query}`;
}

export function rentalMapGroups(listings: RentalListing[]) {
  const groups = new Map<string, { key: string; latitude: number; longitude: number; listings: RentalListing[] }>();
  for (const listing of listings) {
    const point = rentalLocation(listing);
    if (!point) continue;
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    const group = groups.get(key) ?? { key, latitude: point.latitude, longitude: point.longitude, listings: [] };
    group.listings.push(listing);
    groups.set(key, group);
  }
  return [...groups.values()];
}
