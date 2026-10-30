import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/admin/jobs/route";

test("job review pages cover both source groups without duplicates and include the total", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const saved = keys.map(key => process.env[key]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  const rows = Array.from({ length: 58 }, (_, index) => ({ id: String(index).padStart(3, "0"), source_type: index < 12 ? "reliefweb" : "linkedin", is_approved: index === 57, is_rejected: false, created_at: "2026-10-30T00:00:00Z" }));
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "db.example");
    if (url.pathname.includes("/auth/")) return Response.json({ id: "admin-user", aud: "authenticated", role: "authenticated" });
    if (url.pathname.endsWith("/profiles")) return Response.json([{ is_admin: true }]);
    let found = rows.filter(row => url.searchParams.get("source_type") === "eq.reliefweb" ? row.source_type === "reliefweb" : row.source_type !== "reliefweb");
    if (url.searchParams.get("is_approved") === "neq.true") found = found.filter(row => !row.is_approved);
    const count = found.length;
    if (init?.method !== "HEAD") {
      assert.ok(url.searchParams.get("order")?.endsWith("id.asc"), "Equal timestamps have deterministic ordering");
      const offset = Number(url.searchParams.get("offset") ?? 0);
      found = found.slice(offset, offset + Number(url.searchParams.get("limit")));
    }
    return new Response(init?.method === "HEAD" ? null : JSON.stringify(found), { headers: { "Content-Type": "application/json", "Content-Range": `0-${Math.max(0, count - 1)}/${count}` } });
  };
  try {
    const seen: string[] = [];
    for (const offset of [0, 25, 50]) {
      const response = await GET(new NextRequest(`https://example.test/api/admin/jobs?pendingOnly=true&offset=${offset}&limit=25`, { headers: { Authorization: "Bearer test" } }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.totalCount, 57);
      assert.equal(body.jobs.length, offset === 50 ? 7 : 25);
      seen.push(...body.jobs.map((job: { id: string }) => job.id));
    }
    assert.equal(new Set(seen).size, 57);
    assert.deepEqual(seen, rows.slice(0, 57).map(row => row.id));
    const response = await GET(new NextRequest("https://example.test/api/admin/jobs?offset=75&limit=25", { headers: { Authorization: "Bearer test" } }));
    const body = await response.json();
    assert.equal(body.totalCount, 58);
    assert.deepEqual(body.jobs, []);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
  }
});
