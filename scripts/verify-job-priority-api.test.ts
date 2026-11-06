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
    const start=Number(url.searchParams.get("offset")??0),limit=Number(url.searchParams.get("limit")??500);
    return Response.json(rows.slice(start,start+limit));
  };
  try {
    const request = (query: string) => new NextRequest(`https://example.test/api/admin/jobs?pendingOnly=true&${query}`, { headers: { Authorization: "Bearer test" } });
    let response = await GET(request("priority=high&limit=1&offset=0"));
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.jobs[0].id, "c");
    assert.equal(body.jobs[0].review_priority.score, 100);
    assert.equal(body.totalCount, 3);
    assert.deepEqual(body.priorityCounts, { high: 3, possible: 0, low: 1, all: 4, gold:0 });
    body = await (await GET(request("priority=high&limit=1&offset=1"))).json();
    assert.equal(body.jobs[0].id, "b");
    body = await (await GET(request("priority=all"))).json();
    assert.deepEqual(body.jobs.map((job: { id: string }) => job.id), ["c", "b", "d", "a"]);
    body=await(await GET(request("priority=all&q=example%20cwmd"))).json();
    assert.deepEqual(body.jobs.map((job:{id:string})=>job.id),["b"]);assert.equal(body.priorityCounts.all,1);
    body=await(await GET(request("q=work&offset=1&limit=1"))).json();
    assert.equal(body.totalCount,2);assert.equal(body.jobs[0].id,"b");
    assert.equal((await GET(request("q="+"x".repeat(201)))).status,400);
    rows.splice(0,rows.length,...Array.from({length:601},(_,i)=>({id:`large-${i}`,title:"Program Manager",description:i===600?"CWMD rareword":"General work",source_type:"adzuna",company_name:"Example",created_at:"2026-10-30T00:00:00Z"})));
    body=await(await GET(request("priority=all&q=rareword"))).json();
    assert.equal(body.totalCount,1);assert.equal(body.jobs[0].id,"large-600");
    response = await GET(request("priority=invalid"));
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = beforeFetch;
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
  }
});
