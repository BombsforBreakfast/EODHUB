import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HUB_SUPPORT_COSTS, HUB_SUPPORT_PURPOSE, isSupportAmount, parseSupportAmount } from "../app/lib/hubSupport";
import { supportContributorDetails, type ContributorSession } from "../app/lib/hubSupportContributor";

test("custom contributions use exact cents and reject invalid or excessive amounts", () => {
  for (const [input, expected] of [["1",100],["3.01",301],["5.99",599],["500.00",50000],[" 10.5 ",1050]] as const) assert.equal(parseSupportAmount(input), expected);
  for (const input of ["", "0", "0.99", "500.01", "1000", "-3", "1.001", "1e2", "Infinity", "1,000", "1.2.3", "$5"]) assert.equal(parseSupportAmount(input), null, input);
  for (const input of [null, "300", 100.5, NaN, Infinity, 99, 50001]) assert.equal(isSupportAmount(input), false);
});

test("checkout and payment handler never use legacy membership credentials or entitlements", () => {
  const checkout = readFileSync("app/api/hub-support/checkout/route.ts", "utf8");
  const webhook = readFileSync("app/api/webhooks/hub-support/route.ts", "utf8");
  const config = readFileSync("app/lib/server/hubSupport.ts", "utf8");
  assert.match(checkout, /mode: "payment"/);
  assert.match(config, /STRIPE_SUPPORT_SECRET_KEY/);
  for (const source of [checkout, webhook, config]) assert.doesNotMatch(source, /process\.env\.STRIPE_SECRET_KEY|from\("profiles"\)|billing_entitlements|syncStripeMemberSubscription|subscription_status/);
  assert.match(checkout, /idempotencyKey/);
  assert.match(webhook, /constructEvent/);
  assert.match(webhook, /event\.livemode !== live/);
  assert.equal(HUB_SUPPORT_PURPOSE, "eod_hub_voluntary_support");
});

test("support records are private and refunds are monotonic even across webhook retries", () => {
  const migration = readFileSync("supabase/migrations/20261018180000_hub_support.sql", "utf8");
  assert.match(migration, /hub_contributions enable row level security/);
  assert.match(migration, /revoke all on public\.hub_contributions/);
  assert.match(migration, /p_amount not between 100 and 50000/);
  assert.match(migration, /if n > 10/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /greatest\(refunded_cents/);
  assert.doesNotMatch(migration, /public\.profiles|billing_entitlements|subscription_status/);
});

test("web-only UI waits for platform detection and keeps guest return pages public", () => {
  const provider = readFileSync("app/components/support/HubSupportProvider.tsx", "utf8");
  assert.match(provider, /serverSnapshot = \(\) => false/);
  assert.match(provider, /webSnapshot = \(\) => !isNativeApp\(\)/);
  assert.match(provider, /if \(!isNativeApp\(\)\) setView/);
  assert.match(readFileSync("proxy.ts", "utf8"), /pathname === "\/support-the-hub"/);
  assert.equal(HUB_SUPPORT_COSTS.find(([name]) => name === "Google Play registration")?.[1], "$25 one-time");
});

test("contributor details require the exact paid support transaction", () => {
  const row = { id: "contribution-1", amount_cents: 300, livemode: true, checkout_session_id: "cs_live_support" };
  const session: ContributorSession = { id: row.checkout_session_id, metadata: { purpose: HUB_SUPPORT_PURPOSE, contribution_id: row.id }, mode: "payment", currency: "usd", amount_total: 300, livemode: true, payment_status: "paid", customer_details: { email: "supporter@example.com", name: "Card name" }, collected_information: { individual_name: "  Chosen name  " } };
  assert.deepEqual(supportContributorDetails(row, session), { contributor_name: "Chosen name", contributor_email: "supporter@example.com" });
  const mismatches: Partial<ContributorSession>[] = [
    { id: "cs_other" }, { metadata: { purpose: "membership", contribution_id: row.id } },
    { metadata: { purpose: HUB_SUPPORT_PURPOSE, contribution_id: "another-contributor" } },
    { livemode: false }, { amount_total: 100 }, { currency: "eur" }, { mode: "subscription" }, { payment_status: "unpaid" },
  ];
  for (const mismatch of mismatches) assert.equal(supportContributorDetails(row, { ...session, ...mismatch }), null);
  assert.deepEqual(supportContributorDetails(row, { ...session, collected_information: null }), { contributor_name: "Card name", contributor_email: "supporter@example.com" });
  assert.deepEqual(supportContributorDetails(row, { ...session, customer_details: null, collected_information: null, customer_email: "guest@example.com" }), { contributor_name: null, contributor_email: "guest@example.com" });
});
