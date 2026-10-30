import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { removeJobWithImportMemory } from "../app/lib/server/removeJobWithImportMemory";
import { JobImportMemory, filterRememberedJobs, jobMemoryKeys, loadJobImportMemory, type JobMemoryRow } from "../app/lib/server/jobImportMemory";
import { POST as importLinkedIn } from "../app/api/import-linkedin/route";
import { GET as purge } from "../app/api/cron/purge-stale-jobs/route";

type Row = JobMemoryRow & { source_type: string; linkedin_job_id?: string; last_seen_at?: string };
const row = (overrides: Partial<Row> = {}): Row => ({
  id: "job-1", title: "EOD Technician", company_name: "Example Defense", location: "Tampa, FL",
  apply_url: "https://example.test/jobs/req-123", is_approved: false, is_rejected: false,
  created_at: new Date().toISOString(), source_type: "linkedin", linkedin_job_id: "123456", ...overrides,
});
const identity = { title: "EOD Technician", companyName: "Example Defense", location: "Tampa, FL", applyUrl: "https://linkedin.com/jobs/view/999999/" };

async function withDatabase(
  initial: Row[],
  verify: (state: { rows: Row[]; deletes: string[]; writes: string[]; saved: Set<string>; flags: Set<string> }, client: ReturnType<typeof createClient>) => Promise<void>,
  failPatch = false,
  failRead = false,
) {
  const originalFetch = globalThis.fetch;
  const names = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];
  const originalEnv = names.map(name => process.env[name]);
  const state = { rows: structuredClone(initial), deletes: [] as string[], writes: [] as string[], saved: new Set(initial.map(item => item.id)), flags: new Set(initial.map(item => item.id)) };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  process.env.CRON_SECRET = "test-secret";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "db.example", "Tests never call a real database");
    const table = url.pathname.split("/").pop()!;
    const method = init?.method ?? "GET";
    if (failRead && method === "GET") return Response.json({ message: "Memory unavailable", code: "42501" }, { status: 403 });
    const matches = (item: Row) => {
      for (const [key, expression] of url.searchParams) {
        const value = item[key as keyof Row];
        if (expression.startsWith("eq.") && String(value) !== expression.slice(3)) return false;
        if (expression === "neq.true" && value === true) return false;
        if (expression.startsWith("lt.") && String(value) >= expression.slice(3)) return false;
        if (expression.startsWith("in.(") && !expression.slice(4, -1).split(",").map(part => part.replace(/^"|"$/g, "")).includes(String(value))) return false;
      }
      if (url.searchParams.has("or")) return item.is_rejected || !item.is_approved || item.created_at >= new Date(Date.now() - 30 * 86400000).toISOString();
      return true;
    };
    const selected = state.rows.filter(matches);
    if (method === "DELETE") {
      state.deletes.push(table);
      if (table === "jobs") state.rows = state.rows.filter(item => !matches(item));
      else {
        const filter = url.searchParams.get("job_id") ?? "";
        const ids = filter.startsWith("in.(") ? filter.slice(4, -1).split(",") : [filter.slice(3)];
        for (const id of ids) {
          if (table === "saved_jobs") state.saved.delete(id);
          if (table === "job_stale_flags") state.flags.delete(id);
        }
      }
      return Response.json(url.searchParams.has("select") ? selected : [], { headers: { "content-range": `*/${selected.length}` } });
    }
    if (method === "PATCH") {
      state.writes.push(table);
      if (failPatch) return Response.json({ message: "Update failed", code: "42501" }, { status: 403 });
      const patch = JSON.parse(String(init?.body));
      for (const item of selected) Object.assign(item, patch);
    }
    if (method === "POST") {
      state.writes.push(table);
      const payload = JSON.parse(String(init?.body));
      state.rows.push(...(Array.isArray(payload) ? payload : [payload]));
      return Response.json([]);
    }
    const accept = new Headers(init?.headers).get("Accept") ?? "";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? selected.length);
    return Response.json(accept.includes("vnd.pgrst.object") ? selected[0] ?? null : selected.slice(offset, offset + limit));
  };
  try {
    await verify(state, createClient("https://db.example", "test", { auth: { persistSession: false, autoRefreshToken: false } }));
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (originalEnv[index] === undefined) delete process.env[name]; else process.env[name] = originalEnv[index]; });
  }
}

for (const source of ["adzuna", "usajobs", "linkedin", "reliefweb"]) {
  test(`deleting an imported ${source} listing retains hidden memory and removes member references`, async () => {
    await withDatabase([row({ source_type: source })], async (state, client) => {
      assert.deepEqual(await removeJobWithImportMemory(client, "job-1"), { ok: true });
      assert.equal(state.rows[0].is_rejected, true);
      assert.equal(state.rows[0].is_approved, false);
      assert.equal(state.rows[0].linkedin_job_id, "123456");
      assert.equal(state.saved.size, 0);
      assert.equal(state.flags.size, 0);
      assert.ok(!state.deletes.includes("jobs"));
      const result = await filterRememberedJobs(client, [identity], candidate => candidate);
      assert.equal(result.candidates.length, 0, "A changed source URL cannot bring the deleted role back");
      assert.equal(result.skipped, 1);
      assert.deepEqual(await removeJobWithImportMemory(client, "job-1"), { ok: true }, "Repeated deletion is safe");
    });
  });
}

test("manual jobs keep hard deletion and missing jobs remain idempotent", async () => {
  await withDatabase([row({ source_type: "manual" })], async (state, client) => {
    assert.deepEqual(await removeJobWithImportMemory(client, "job-1"), { ok: true });
    assert.equal(state.rows.length, 0);
    assert.ok(state.deletes.includes("jobs"));
    assert.deepEqual(await removeJobWithImportMemory(client, "missing"), { ok: true });
  });
});

test("failed rejection does not hard-delete a listing or its saved references", async () => {
  await withDatabase([row()], async (state, client) => {
    assert.equal((await removeJobWithImportMemory(client, "job-1")).ok, false);
    assert.equal(state.rows[0].is_rejected, false);
    assert.equal(state.saved.size, 1);
    assert.deepEqual(state.deletes, []);
  }, true);
});

test("pending-only cleanup does not remove a job approved after the cleanup was planned", async () => {
  await withDatabase([row({ is_approved: true })], async (state, client) => {
    assert.deepEqual(await removeJobWithImportMemory(client, "job-1", { pendingOnly: true }), { ok: true, skipped: true });
    assert.equal(state.rows[0].is_approved, true);
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.deletes, []);
  });
});

test("approved current jobs refresh once without being requeued; other locations and expired approvals remain eligible", async () => {
  await withDatabase([row({ is_approved: true })], async (state, client) => {
    const result = await filterRememberedJobs(client, [identity, { ...identity, applyUrl: "https://adzuna.com/details/999" }], candidate => candidate);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.refreshed, 1);
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].is_approved, true);
    assert.ok(state.rows[0].last_seen_at);
    const other = await filterRememberedJobs(client, [{ ...identity, location: "Austin, TX" }], candidate => candidate);
    assert.equal(other.candidates.length, 1);
  });
  const memory = new JobImportMemory([row({ is_approved: true, created_at: "2000-01-01T00:00:00.000Z" })]);
  assert.equal(memory.match(identity), undefined);
});

test("deleted memory wins, tracking parameters do not defeat it, and generic careers pages do not conflate jobs", () => {
  const memory = new JobImportMemory([row({ is_approved: true }), row({ id: "rejected", is_rejected: true, created_at: "2000-01-01T00:00:00.000Z" })]);
  assert.equal(memory.match(identity)?.rejected, true);
  assert.equal(memory.match({ ...identity, title: "Different title", location: "Elsewhere", applyUrl: "https://www.example.test/jobs/req-123/?utm_source=foo#details" })?.rejected, true);
  assert.deepEqual(jobMemoryKeys({ title: "", companyName: "", applyUrl: "https://example.test/careers/" }), []);
});

test("already queued duplicates disappear while the approved original and unrelated pending jobs remain", async () => {
  await withDatabase([row({ is_approved: true }), row({ id: "pending-copy", linkedin_job_id: "999999" }), row({ id: "other-location", location: "Austin, TX", apply_url: "https://example.test/jobs/other" })], async (state, client) => {
    const result = await filterRememberedJobs(client, [identity], candidate => candidate);
    assert.equal(result.candidates.length, 0);
    assert.deepEqual(state.rows.map(item => item.id).sort(), ["job-1", "other-location"]);
    assert.equal(state.rows.find(item => item.id === "job-1")?.is_approved, true);
    assert.equal(state.saved.has("pending-copy"), false);
  });
});

test("LinkedIn API does not requeue approved or deleted duplicates arriving under a different source ID", async () => {
  for (const rejected of [true, false]) {
    await withDatabase([row({ is_rejected: rejected, is_approved: !rejected })], async (state) => {
      const response = await importLinkedIn(new NextRequest("https://example.test/api/import-linkedin", {
        method: "POST", headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: [{ ...identity, description: "EOD UXO explosive ordnance disposal operations", linkedinJobId: "999999", relevanceScore: 100 }] }),
      }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.imported, 0);
      assert.deepEqual(body.sample, []);
      assert.equal(state.rows.length, 1);
      assert.equal(state.rows[0].is_approved, !rejected);
    });
  }
});

test("daily stale purge preserves old rejected memory while removing expired visible jobs", async () => {
  await withDatabase([row({ is_rejected: true, created_at: "2000-01-01T00:00:00.000Z" }), row({ id: "expired", created_at: "2000-01-01T00:00:00.000Z" })], async (state) => {
    const response = await purge(new NextRequest("https://example.test/api/cron/purge-stale-jobs", { headers: { Authorization: "Bearer test-secret" } }));
    assert.equal(response.status, 200);
    assert.deepEqual(state.rows.map(item => item.id), ["job-1"]);
  });
});

test("moderation memory reads beyond the first 500 records", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => row({ id: `job-${index}`, title: `EOD Technician ${index}`, is_approved: true, apply_url: `https://example.test/jobs/${index}` }));
  await withDatabase(rows, async (_state, client) => {
    const memory = await loadJobImportMemory(client);
    assert.equal(memory.match({ ...identity, title: "EOD Technician 500", applyUrl: "https://other.test/jobs/new" })?.id, "job-500");
  });
});

test("a memory read failure stops LinkedIn imports instead of reintroducing jobs", async () => {
  await withDatabase([], async (state) => {
    const response = await importLinkedIn(new NextRequest("https://example.test/api/import-linkedin", {
      method: "POST", headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: [{ ...identity, description: "EOD UXO explosive ordnance disposal", linkedinJobId: "999999" }] }),
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(state.writes, []);
  }, false, true);
});
