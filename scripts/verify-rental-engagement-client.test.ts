import assert from "node:assert/strict";
import { test } from "node:test";
import { recordRentalEngagement } from "../app/lib/rentals/analytics.client";
import { rentalWizardGaps } from "../app/lib/rentals/propertyCompletion";
import { propertySchema } from "../app/lib/rentals/provider";

test("engagement is nonblocking, locally deduplicated, and sends no visitor or contact data", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  const data = new Map<string, string>(), sent: Record<string, string>[] = [];
  let now = 1793380000000;
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
    globalThis.fetch = (async (_url: unknown, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return new Response("{}"); }) as typeof fetch;
    Date.now = () => now;
    recordRentalEngagement("property", "one", "property_open"); recordRentalEngagement("property", "one", "property_open");
    assert.equal(sent.length, 1); assert.deepEqual(Object.keys(sent[0]).sort(), ["eventId", "id", "kind", "subject"]);
    recordRentalEngagement("property", "one", "contact_open"); assert.equal(sent.length, 2);
    now += 30 * 60 * 1000; recordRentalEngagement("property", "one", "property_open"); assert.equal(sent.length, 3);
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    assert.doesNotThrow(() => recordRentalEngagement("advertiser", "eod_home_buying", "ad_click"));
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage); else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
test("an incomplete wizard shows at most four actionable sections without raw validator messages", () => {
  const result = propertySchema.safeParse({}); assert.equal(result.success, false);
  if (result.success) return;
  const groups = rentalWizardGaps(result.error.issues);
  assert.equal(groups.length, 4); assert.deepEqual(groups.map(g => g.step), [0,1,2,3]);
  assert.ok(groups[0].fields.includes("ZIP code")); assert.ok(groups[1].fields.includes("Rental amount")); assert.ok(groups[2].fields.includes("Property photos")); assert.ok(groups[3].fields.includes("Email address"));
  assert.doesNotMatch(JSON.stringify(groups), /undefined|Invalid input|expected string|received/);
  assert.equal(rentalWizardGaps([{path:["photos",0]},{path:["photos",1]}])[0].fields.length, 1);
});
