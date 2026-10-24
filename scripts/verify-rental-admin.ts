import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, PATCH } from "../app/api/admin/rentals/route";
import { loadRentalListings } from "../app/lib/rentals/availability.server";
import { parseRentalAvailability } from "../app/lib/rentals/availability";
import { OWNER_ADMIN_USER_ID, OWNER_ADMIN_EMAIL } from "../app/lib/ownerAdminAccess";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rental-admin-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const originalFetch = globalThis.fetch;
let mode = "owner";
let writes = 0;
let failStorage = false;
let row = { listing_id: "4276-calinda-158", status: "pending", projected_availability_date: null as string | null, updated_at: "2026-10-24T00:00:00Z" };
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname === "/auth/v1/user") return Response.json({ id: mode === "other-admin" ? "12345678-1234-4123-8123-123456789abc" : OWNER_ADMIN_USER_ID, email: OWNER_ADMIN_EMAIL, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} });
  if (url.pathname.endsWith("/profiles")) return Response.json([{ is_admin: mode !== "member" }]);
  assert.ok(url.pathname.endsWith("/rental_listing_status"));
  if (failStorage) return Response.json({ message: "Storage unavailable" }, { status: 503 });
  if (options?.method === "POST") {
    const update = JSON.parse(String(options.body));
    assert.equal(update.updated_by, OWNER_ADMIN_USER_ID);
    assert.equal(update.listing_id, row.listing_id);
    row = { ...row, ...update }; writes++;
    return new Response(null, { status: 201 });
  }
  return Response.json([row]);
};
const url = "http://localhost/api/admin/rentals";
const request = (body?: unknown, token = "owner-token") => new NextRequest(url, { method: body === undefined ? "GET" : "PATCH", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const input = { id: row.listing_id, status: "unavailable", projectedAvailabilityDate: "2027-01-15" };
async function main() {
  assert.equal((await GET(request(undefined, ""))).status, 401);
  assert.equal((await PATCH(request(input, ""))).status, 401);
  for (mode of ["member", "other-admin"]) {
    assert.equal((await GET(request())).status, 403);
    assert.equal((await PATCH(request(input))).status, 403);
  }
  assert.equal(writes, 0); mode = "owner";
  assert.equal((await PATCH(request({ ...input, id: "unknown" }))).status, 404);
  for (const bad of ["2027-02-29", "not-a-date", 123, undefined]) assert.throws(() => parseRentalAvailability({ ...input, projectedAvailabilityDate: bad }));
  assert.equal((await PATCH(request({ ...input, status: "bogus" }))).status, 400);
  assert.equal((await PATCH(request(input))).status, 200);
  const publicListing = (await loadRentalListings()).find(item => item.id === row.listing_id)!;
  assert.equal(publicListing.availability.status, "unavailable");
  assert.equal(publicListing.projectedAvailabilityDate, "2027-01-15");
  const admin = await (await GET(request())).json();
  assert.equal(admin.items.find((item: { id: string }) => item.id === row.listing_id).projectedAvailabilityDate, "2027-01-15");
  for (const status of ["available-now", "pending", "unavailable"]) assert.equal((await PATCH(request({ ...input, status, projectedAvailabilityDate: null }))).status, 200);
  assert.equal((await loadRentalListings()).find(item => item.id === row.listing_id)!.projectedAvailabilityDate, undefined);
  failStorage = true;
  assert.equal((await PATCH(request(input))).status, 503);
  assert.equal((await GET(request())).status, 503);
  await assert.rejects(loadRentalListings(), /temporarily unavailable/);
  console.log("Rental admin checks passed: owner-only access, three statuses, invalid dates, save/clear date, public loader and storage failures.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });
