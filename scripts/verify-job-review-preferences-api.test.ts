import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/admin/job-review-preferences/route";

test("preference actions require admin auth; preview has no writes and exclusion cleanup protects approved jobs", async () => {
  const previousFetch = globalThis.fetch;
  const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const previousEnv = envNames.map(name => process.env[name]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  let admin = false;
  const writes: string[] = [];
  const job = { id: "12345678-1234-1234-1234-123456789012", title: "Senior Helicopter Pilot", is_approved: false, source_type: "linkedin" };
  let approveBeforeCleanup = false;
  let seenPreview = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "db.example");
    const method = init?.method ?? "GET";
    const table = url.pathname.split("/").pop();
    if (url.pathname.includes("/auth/")) return Response.json({ id: "admin", aud: "authenticated", role: "authenticated" });
    if (table === "profiles") return Response.json([{ is_admin: admin }]);
    if (method !== "GET") writes.push(`${method}:${table}`);
    if (table === "job_type_exclusions") return Response.json([]);
    if (table === "job_review_feedback") return Response.json([]);
    if (table === "jobs" && method === "GET") {
      if (url.searchParams.has("id")) return Response.json({ ...job, is_approved: approveBeforeCleanup });
      assert.equal(url.searchParams.get("is_rejected"), "neq.true");
      assert.equal(url.searchParams.get("is_approved"), "neq.true");
      assert.match(url.searchParams.get("source_type") ?? "", /linkedin/);
      seenPreview = true;
      return Response.json([job]);
    }
    throw new Error(`Unexpected write: ${method}:${table}`);
  };
  const request = (body: object, token = true) => new NextRequest("https://example.test/api/admin/job-review-preferences", { method: "POST", headers: { ...(token ? { Authorization: "Bearer test" } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await POST(request({ action: "add_exclusion", phrase: "helicopter pilot" }, false))).status, 401);
    assert.equal((await POST(request({ action: "add_exclusion", phrase: "helicopter pilot" }))).status, 403);
    assert.deepEqual(writes, []);
    admin = true;
    assert.equal((await GET(new NextRequest("https://example.test/api/admin/job-review-preferences", { headers: { Authorization: "Bearer test" } }))).status, 200);
    const preview = await (await POST(request({ action: "preview_exclusion", phrase: "HELICOPTER-PILOT" }))).json();
    assert.equal(preview.phrase, "helicopter pilot"); assert.equal(preview.count, 1);
    assert.deepEqual(writes, []); assert.equal(seenPreview, true);
    assert.equal((await POST(request({ action: "add_exclusion", phrase: "!*" }))).status, 400);
    assert.equal((await POST(request({ action: "unknown" }))).status, 400);
    approveBeforeCleanup = true;
    const saved = await (await POST(request({ action: "add_exclusion", phrase: "helicopter pilot" }))).json();
    assert.equal(saved.success, true); assert.equal(saved.removed, 0);
    assert.deepEqual(writes, ["POST:job_type_exclusions"], "Approved job and feedback must remain untouched");
  } finally {
    globalThis.fetch = previousFetch;
    envNames.forEach((name, i) => { if (previousEnv[i] === undefined) delete process.env[name]; else process.env[name] = previousEnv[i]; });
  }
});
