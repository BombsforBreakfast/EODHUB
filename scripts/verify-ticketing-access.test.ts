import { strict as assert } from "node:assert";
import { test } from "node:test";
import { activeAssignment, assignedAccess, bearerClaimsTicketing, isTicketingIdentity, ticketingApiAllowed, ticketingEmail, ticketingOrigin, type Assignment } from "../app/lib/ticketing/access";
import { eventStartFromLocal, checkInOpen } from "../app/lib/ticketing/model";
import { emptyEventDraft, parseCoordinatorProfile, parseEventDraft } from "../app/lib/ticketing/event-intake";
import { isExcludedFromPageTimeAnalytics } from "../app/lib/analyticsPath";
const actor = "coordinator-a", event = "event-a", now = Date.parse("2026-11-02T15:00:00Z");
const assignment: Assignment = { id: "a", event_id: event, user_id: actor, role: "coordinator", expires_at: null, revoked_at: null };
test("coordinator access is event and identity scoped", () => {
  assert(assignedAccess([assignment], actor, event, false, now));
  assert(assignedAccess([assignment], actor, event, true, now));
  assert(!assignedAccess([assignment], actor, "event-b", false, now));
  assert(!assignedAccess([assignment], "customer-a", event, false, now));
});
test("operator has scanning only, with a required future expiry", () => {
  const operator: Assignment = { ...assignment, role: "checkin_staff", expires_at: "2026-11-03T00:00:00Z" };
  assert(assignedAccess([operator], actor, event, true, now));
  assert(!assignedAccess([operator], actor, event, false, now));
  assert(!activeAssignment({ ...operator, expires_at: null }, now));
  assert(!activeAssignment({ ...operator, expires_at: "2026-11-02T15:00:00Z" }, now));
});
test("revocation denies an existing assignment immediately", () => {
  assert(!assignedAccess([{ ...assignment, revoked_at: "2026-11-02T14:59:59Z" }], actor, event, true, now));
});
test("independent operator assignment cannot inherit another event's coordinator permission", () => {
  const rows: Assignment[] = [assignment, { ...assignment, id: "b", event_id: "event-b", role: "checkin_staff", expires_at: "2026-11-03T00:00:00Z" }];
  assert(assignedAccess(rows, actor, "event-b", true, now));
  assert(!assignedAccess(rows, actor, "event-b", false, now));
});
test("pilot cannot be enabled on a production deployment or by a browser flag", () => {
  assert.equal(ticketingOrigin({ NODE_ENV: "production", VERCEL_ENV: "production", TICKETING_PILOT_ENABLED: "1", VERCEL_URL: "eodhub.vercel.app" }), null);
  assert.equal(ticketingOrigin({ NODE_ENV: "development", NEXT_PUBLIC_TICKETING_PILOT_ENABLED: "1", TICKETING_PILOT_ORIGIN: "http://127.0.0.1:65464" }), null);
});
test("preview origin is constrained to Vercel; local origin to loopback development", () => {
  assert.equal(ticketingOrigin({ NODE_ENV: "production", VERCEL_ENV: "preview", TICKETING_PILOT_ENABLED: "1", VERCEL_BRANCH_URL: "eodhub-git-test.vercel.app" }), "https://eodhub-git-test.vercel.app");
  assert.equal(ticketingOrigin({ NODE_ENV: "production", VERCEL_ENV: "preview", TICKETING_PILOT_ENABLED: "1", VERCEL_URL: "evil.example/path" }), null);
  assert.equal(ticketingOrigin({ NODE_ENV: "development", TICKETING_PILOT_ENABLED: "1", TICKETING_PILOT_ORIGIN: "http://127.0.0.1:65464" }), "http://127.0.0.1:65464");
  assert.equal(ticketingOrigin({ NODE_ENV: "development", TICKETING_PILOT_ENABLED: "1", TICKETING_PILOT_ORIGIN: "https://evil.example" }), null);
});
test("API-only role needs server metadata; editable user metadata cannot grant scope", () => {
  assert(isTicketingIdentity({ role: "eod_ticketing", app_metadata: { account_type: "ticketing_customer" } }));
  assert(!isTicketingIdentity({ role: "authenticated", app_metadata: { account_type: "ticketing_customer" } }));
  assert(!isTicketingIdentity({ role: "eod_ticketing" }));
});
test("bearer inspection is deny only and ticketing API prefix is exact", () => {
  const token = `Bearer e30.${Buffer.from(JSON.stringify({ role: "eod_ticketing" })).toString("base64url")}.forged`;
  assert(bearerClaimsTicketing(token));
  assert(!bearerClaimsTicketing("Bearer bad"));
  assert(ticketingApiAllowed("/api/ticketing/auth"));
  assert(!ticketingApiAllowed("/api/ticketing-impersonate"));
});
test("verified email cannot be changed through a coordinator profile", () => {
  assert.equal(ticketingEmail(" Test@Example.com "), "test@example.com");
  assert.throws(() => parseCoordinatorProfile({ name: "Test Person", email: "another@example.com", phone: "555-555-1234", organization: "Demo", affiliation: "None" }, "test@example.com"));
});
test("event-day policy remains timezone aware across daylight saving", () => {
  const startsAt = eventStartFromLocal("2026-11-01T09:00", "America/New_York");
  assert(checkInOpen({ startsAt, timeZone: "America/New_York" }, Date.parse("2026-11-02T04:59:59Z")));
  assert(!checkInOpen({ startsAt, timeZone: "America/New_York" }, Date.parse("2026-11-02T05:00:00Z")));
});
test("submitted flyer must use the new protected upload endpoint", () => {
  const draft = { ...emptyEventDraft(), title: "Pilot event", organizer: "Pilot organizer", localStart: "2026-12-05T09:00", localEnd: "2026-12-05T17:00", venue: "Test venue", address: "123 Test Street", city: "Test City", region: "NC", description: "An example event for the shared pilot.", contactName: "Test Organizer", contactPhone: "555-555-1234", contactEmail: "test@example.invalid", flyerUrl: "/api/ticketing/flyer?id=12345678-1234-4234-8234-123456789abc" };
  assert.equal(parseEventDraft(draft).draft.flyerUrl, draft.flyerUrl);
  assert.throws(() => parseEventDraft({ ...draft, flyerUrl: "https://evil.example/private.svg" }), /Upload a flyer/);
});
test("pilot traffic is excluded without changing Jobs, Rentals or Support analytics", () => {
  assert(isExcludedFromPageTimeAnalytics("/ticketing"));
  assert(isExcludedFromPageTimeAnalytics("/ticketing/access#token_hash=discarded"));
  for(const path of ["/ticketing-announcement", "/jobs", "/promote/rentals", "/support-the-hub"]) assert(!isExcludedFromPageTimeAnalytics(path));
});
