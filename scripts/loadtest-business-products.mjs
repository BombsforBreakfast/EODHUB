/**
 * Load test for business org product endpoints + optional Shopify sync.
 *
 * Usage:
 *   node scripts/loadtest-business-products.mjs
 *   node scripts/loadtest-business-products.mjs --sync
 *
 * Env (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LOADTEST_PAGE_ID (optional, defaults to Branded Apparel page)
 *   LOADTEST_AUTH_EMAIL / LOADTEST_AUTH_PASSWORD (required for --sync)
 *   SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN (optional env fallback)
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  return {
    sync: argv.includes("--sync"),
    baseUrl: process.env.LOADTEST_BASE_URL ?? "http://localhost:3000",
    concurrency: Number(process.env.LOADTEST_CONCURRENCY ?? 10),
    iterations: Number(process.env.LOADTEST_ITERATIONS ?? 20),
  };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function timedFetch(label, url, init) {
  const started = performance.now();
  const res = await fetch(url, init);
  const elapsed = performance.now() - started;
  const body = await res.text();
  return { label, ok: res.ok, status: res.status, elapsed, body };
}

async function getAccessToken(supabaseUrl, anonKey, email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || `Auth failed (${res.status})`);
  }
  return data.access_token;
}

async function runPool(tasks, concurrency) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      results[current] = await tasks[current]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function summarize(label, results) {
  const ok = results.filter((r) => r.ok);
  const timings = results.map((r) => r.elapsed);
  console.log(`\n${label}`);
  console.log(`  requests: ${results.length}`);
  console.log(`  success:  ${ok.length}/${results.length}`);
  console.log(`  p50:      ${percentile(timings, 50).toFixed(0)} ms`);
  console.log(`  p95:      ${percentile(timings, 95).toFixed(0)} ms`);
  console.log(`  max:      ${Math.max(...timings).toFixed(0)} ms`);
  if (ok.length < results.length) {
    const sample = results.find((r) => !r.ok);
    console.log(`  sample error: ${sample?.status} ${sample?.body?.slice(0, 180)}`);
  }
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pageId = process.env.LOADTEST_PAGE_ID ?? "3afe6384-6d4e-4d4b-a8d5-f98927cf53a8";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`Page ID:  ${pageId}`);
  console.log(`Pool:     ${args.concurrency} concurrent x ${args.iterations} requests`);

  const productTasks = Array.from({ length: args.iterations }, (_, i) => () =>
    timedFetch(
      `products-${i}`,
      `${args.baseUrl}/api/business-org-pages/products?pageId=${encodeURIComponent(pageId)}`,
      { cache: "no-store" },
    ),
  );

  const productResults = await runPool(productTasks, args.concurrency);
  summarize("GET /api/business-org-pages/products", productResults);

  if (args.sync) {
    const email = process.env.LOADTEST_AUTH_EMAIL;
    const password = process.env.LOADTEST_AUTH_PASSWORD;
    if (!email || !password) {
      throw new Error("Set LOADTEST_AUTH_EMAIL and LOADTEST_AUTH_PASSWORD for --sync");
    }

    const accessToken = await getAccessToken(supabaseUrl, anonKey, email, password);
    const syncTasks = Array.from({ length: Math.min(args.iterations, 5) }, (_, i) => () =>
      timedFetch(
        `sync-${i}`,
        `${args.baseUrl}/api/business-org-pages/shopify/sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ business_org_page_id: pageId }),
        },
      ),
    );

    const syncResults = await runPool(syncTasks, Math.min(args.concurrency, 3));
    summarize("POST /api/business-org-pages/shopify/sync", syncResults);
  } else {
    console.log("\nSkipped Shopify sync load test. Re-run with --sync after Shopify credentials are configured.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
