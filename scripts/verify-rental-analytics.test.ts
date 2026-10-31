import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyticsDates, emptyCounts, rentalAnalyticsCsv, totalCounts, type AnalyticsReport } from "../app/lib/rentals/analytics";
import { analyticsCatalog, rentalAnalyticsReport, engagementOwner } from "../app/lib/rentals/analytics.server";
import { GET as adminGet } from "../app/api/admin/rentals/analytics/route";
import { GET as providerGet } from "../app/api/rentals/portal/analytics/route";
import { rentalApiAllowed } from "../app/lib/rentals/provider";

const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", property = "33333333-3333-4333-8333-333333333333";
const p = { id: property, provider_id: owner, published: { address: "1 Test St", city: "Niceville", state: "FL" }, draft: {}, provider: { full_name: "Owner", company: "" } };
function fakeDb(rows = [p], metrics: unknown[] = []) {
  const filters: [string, string, unknown][] = [], pages: number[] = [];
  const db = { from(table: string) {
    let selected = table === "rental_properties" ? rows : metrics;
    const b = {
      select() { return b; }, order() { return b; }, gte() { return b; }, lte() { return b; },
      eq(key: string, value: unknown) { filters.push([table, key, value]); selected = selected.filter(r => (r as Record<string, unknown>)[key] === value || key === "subject_type"); return b; },
      in(key: string, values: unknown[]) { selected = selected.filter(r => values.includes((r as Record<string, unknown>)[key])); return b; },
      range(start: number, end: number) { pages.push(start); return Promise.resolve({ data: selected.slice(start, end + 1), error: null }); },
      maybeSingle() { return Promise.resolve({ data: selected[0] ?? null, error: null }); },
    }; return b;
  } } as unknown as SupabaseClient;
  return { db, filters, pages };
}
test("date bounds handle leap days, invalid values, future and oversized ranges", () => {
  const now = new Date("2026-10-30T18:00:00Z");
  assert.deepEqual(analyticsDates(null, null, now), { start: "2026-10-01", end: "2026-10-30" });
  for (const [start, end] of [["2026-02-30", "2026-03-01"], [null, "x"], ["2026-10-30", "2026-10-01"], ["2025-01-01", "2026-10-30"], [null, "2026-11-01"]]) assert.throws(() => analyticsDates(start, end, now));
  assert.deepEqual(analyticsDates("2024-02-29", "2024-02-29", now), { start: "2024-02-29", end: "2024-02-29" });
});
test("unauthenticated analytics requests fail closed and provider route stays in rental-only scope", async () => {
  assert.equal((await adminGet(new NextRequest("http://localhost/api/admin/rentals/analytics"))).status, 401);
  assert.equal((await providerGet(new NextRequest("http://localhost/api/rentals/portal/analytics"))).status, 401);
  assert.equal(rentalApiAllowed("/api/rentals/portal/analytics", "GET"), true);
  assert.equal(rentalApiAllowed("/api/admin/rentals/analytics", "GET"), false);
});
test("provider reports scope catalog queries and reject another owner's/property's data or advertising", async () => {
  const f = fakeDb();
  const report = await rentalAnalyticsReport(f.db, new URLSearchParams(), owner);
  assert.equal(report.properties.length, 1); assert.equal(report.properties[0].id, property);
  assert.ok(f.filters.some(v => v[0] === "rental_properties" && v[1] === "provider_id" && v[2] === owner));
  for (const q of [`owner=${other}`, "property=1186-muirfield-way", "subject=advertiser"]) await assert.rejects(rentalAnalyticsReport(f.db, new URLSearchParams(q), owner), /not found|own property/);
});
test("admin catalogs include original properties and filter state, owner and property together", async () => {
  const f = fakeDb();
  assert.equal((await analyticsCatalog(f.db)).length, 4);
  const all = await rentalAnalyticsReport(f.db, new URLSearchParams("owner=terry-grawey&state=FL&property=4726-calinda-139"));
  assert.equal(all.selected.length, 1); assert.match(all.selected[0].address, /^4276/);
  assert.equal((await rentalAnalyticsReport(f.db, new URLSearchParams("state=GA"))).selected.length, 0);
});
test("daily reports paginate beyond the default 1,000 rows", async () => {
  const rows = Array.from({ length: 1001 }, () => ({ subject_id: property, ...emptyCounts(), day: "2026-10-30", property_opens: 1 }));
  const f = fakeDb([p], rows);
  const report = await rentalAnalyticsReport(f.db, new URLSearchParams(), owner);
  assert.equal(report.rows.length, 1001); assert.equal(totalCounts(report.rows).property_opens, 1001); assert.ok(f.pages.includes(1000));
});
test("event collection only accepts known advertisers and published public inventory", async () => {
  const f = fakeDb();
  assert.equal(await engagementOwner(f.db, "property", "1186-muirfield-way"), "terry-grawey");
  assert.equal(await engagementOwner(f.db, "property", "unknown-property"), null);
  assert.equal(await engagementOwner(f.db, "advertiser", "eod_home_buying"), "eod_home_buying");
  assert.equal(await engagementOwner(f.db, "advertiser", "random-ad"), null);
});
test("CSV has daily property/state/owner fields, preserves quotes/newlines, and neutralizes formulas", () => {
  const selected = [{ id: "one", ownerId: "owner", owner: "=HYPERLINK(\"bad\")", address: '123, Main "Street"\nUnit 1', state: "FL", city: "Niceville" }, { id: "zero", ownerId: "owner", owner: "Owner", address: "No activity yet", state: "GA", city: "Savannah" }];
  const report: AnalyticsReport = { start: "2026-10-01", end: "2026-10-30", generatedAt: "2026-10-30T18:00:00Z", subject: "property", owners: [], properties: selected, selected, rows: [{ ...emptyCounts(), subject_id: "one", day: "2026-10-30", property_opens: 3 }] };
  const csv = rentalAnalyticsCsv(report);
  assert.ok(csv.startsWith("\uFEFF")); assert.match(csv, /Date \(UTC\)/); assert.match(csv, /Property opens/);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"')); assert.ok(csv.includes('"123, Main ""Street""\nUnit 1"')); assert.match(csv, /No activity yet/);
  assert.doesNotMatch(csv, /visitor_id|email_address|ip_address/);
  const ad = rentalAnalyticsCsv({ ...report, subject: "advertiser" }); assert.match(ad, /Logo clicks/); assert.doesNotMatch(ad, /Property opens/);
});
