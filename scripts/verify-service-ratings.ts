import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, PATCH, POST } from "../app/api/rentals/service-rating/route";
import { reviewPageOptions } from "../app/lib/rentals/serviceRatings";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ratings-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const base = "http://localhost:3012/api/rentals/service-rating";
const reviewId = "12345678-1234-4123-8123-123456789abc";
const visitorId = "12345678-1234-4123-8123-123456789def";
let pinned = false;
let updates = 0;
let lastOrder = "";
let lastOffset = "";
let lastLimit = "";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const headers = new Headers(options?.headers);
  if (url.pathname === "/auth/v1/user") return Response.json({ id: visitorId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} });
  if (url.pathname.endsWith("/profiles")) return Response.json([{ is_admin: headers.get("authorization") === "Bearer test-service-key" && url.searchParams.get("user_id") === `eq.${visitorId}` && currentToken === "admin-token" }]);
  if (url.pathname.endsWith("/rpc/listing_service_rating_overview")) return Response.json([{ average: 3, rating_count: 2, distribution: [{ bombs: 5, count: 1 }, { bombs: 1, count: 1 }] }]);
  assert.ok(url.pathname.endsWith("/listing_service_ratings"), url.href);
  if (options?.method === "PATCH") {
    assert.equal(currentToken, "admin-token");
    assert.equal(url.searchParams.get("review_id"), `eq.${reviewId}`);
    const body = JSON.parse(String(options.body));
    assert.deepEqual(Object.keys(body), ["is_pinned"]);
    pinned = body.is_pinned; updates++;
    return Response.json([{ review_id: reviewId }]);
  }
  if (url.searchParams.has("visitor_id")) return Response.json([]);
  lastOrder = url.searchParams.get("order") ?? "";
  lastOffset = url.searchParams.get("offset") ?? "";
  lastLimit = url.searchParams.get("limit") ?? "";
  return Response.json([{ review_id: reviewId, score: 5, testimonial: "Test fixture", display_name: "Fixture", is_pinned: pinned, created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z" }], { headers: { "content-range": "0-0/25" } });
};
let currentToken = "";
function request(method: string, body?: unknown, token = "") {
  currentToken = token;
  return new NextRequest(base, { method, headers: { origin: "http://localhost:3012", cookie: `eod_listing_service_rater=${visitorId}`, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function main() {
  assert.equal((await PATCH(request("PATCH", { reviewId, pinned: true }))).status, 403);
  assert.equal((await PATCH(request("PATCH", { reviewId, pinned: true }, "member-token"))).status, 403);
  assert.equal(updates, 0);
  assert.equal((await PATCH(request("PATCH", { reviewId, pinned: true }, "admin-token"))).status, 200);
  assert.equal(pinned, true);
  assert.equal(updates, 1);
  assert.equal((await PATCH(request("PATCH", { reviewId, pinned: false }, "admin-token"))).status, 200);
  assert.equal(pinned, false);
  assert.equal((await POST(request("POST", { score: 3.7, displayName: "", testimonial: "" }))).status, 400);
  assert.equal((await POST(request("POST", { score: 4, displayName: "Public name", testimonial: "", publishConsent: false }))).status, 400);
  assert.deepEqual(reviewPageOptions(new URLSearchParams("sort=bad&offset=-3")), { sort: "featured", offset: 0, pageSize: 20 });
  for (const sort of ["featured", "newest", "highest", "lowest"]) {
    const response = await GET(new NextRequest(`${base}?view=all&sort=${sort}&offset=20`));
    const page = await response.json();
    assert.equal(response.status, 200);
    assert.equal(page.total, 25);
    assert.equal(page.nextOffset, null);
    assert.equal(lastOffset, "20"); assert.equal(lastLimit, "20");
    assert.equal(lastOrder, sort === "featured" ? "is_pinned.desc,score.desc,created_at.desc,review_id.asc" : sort === "newest" ? "created_at.desc,review_id.asc" : `score.${sort === "lowest" ? "asc" : "desc"},created_at.desc,review_id.asc`);
  }
  const firstPage = await GET(new NextRequest(`${base}?view=all`));
  assert.equal((await firstPage.json()).nextOffset, 20);
  console.log("Service rating checks passed: admin-only pin/unpin, score validation, publication consent, all four sort orders, and pagination.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });
