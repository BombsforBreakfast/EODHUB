import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/admin/jobs/route";
test("priority API ranks across sources before paging and retains access to lower tiers", async () => {
  const beforeFetch = globalThis.fetch;
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const before = keys.map(key => process.env[key]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  const rows = [
    { id: "a", title: "Accounts Assistant", description: "Bookkeeping", source_type: "reliefweb" },
    { id: "b", title: "Program Manager", description: "CWMD work", source_type: "adzuna" },
    { id: "c", title: "UXO Technician", description: "UXO work", source_type: "usajobs" },
    { id: "d", title: "UAS Operator", description: "", source_type: "linkedin" },
  ].map(job => ({ ...job, company_name: "Example", created_at: "2026-10-30T00:00:00Z" }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "db.example");
    if (url.pathname.includes("/auth/")) return Response.json({ id: "admin", aud: "authenticated", role: "authenticated" });
    if (url.pathname.endsWith("/profiles")) return Response.json([{ is_admin: true }]);
    if (url.pathname.endsWith("/job_priority_rules") || url.pathname.endsWith("/job_type_exclusions") || url.pathname.endsWith("/job_review_feedback")) return Response.json([]);
    assert.equal(url.searchParams.get("is_rejected"), "neq.true");
    assert.equal(url.searchParams.get("is_approved"), "neq.true");
    assert.equal(url.searchParams.has("source_type"), false);
    return Response.json(rows);
  };
  try {
    const request = (query: string) => new NextRequest(`https://example.test/api/admin/jobs?pendingOnly=true&${query}`, { headers: { Authorization: "Bearer test" } });
    let response = await GET(request("priority=high&limit=1&offset=0"));
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.jobs[0].id, "c");
    assert.equal(body.jobs[0].review_priority.score, 100);
    assert.equal(body.totalCount, 2);
    assert.deepEqual(body.priorityCounts, { high: 2, possible: 1, low: 1, all: 4, gold:0 });
    body = await (await GET(request("priority=high&limit=1&offset=1"))).json();
    assert.equal(body.jobs[0].id, "d");
    body = await (await GET(request("priority=all"))).json();
    assert.deepEqual(body.jobs.map((job: { id: string }) => job.id), ["c", "d", "b", "a"]);
    response = await GET(request("priority=invalid"));
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = beforeFetch;
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
  }
});
