import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { jobAutoApprovalReason } from "../app/lib/jobAutoApproval";
import { autoApproveExplicitJobs } from "../app/lib/server/autoApproveExplicitJobs";

test("automatic approval requires an explicit ordnance title, never EOD or description-only keywords", () => {
  for (const title of ["Explosive Ordnance Disposal Technician", "explosive ordnance disposal Instructor", "UXO Technician III", "Unexploded Ordnance Supervisor", "Explosive  Ordnance Disposal Advisor"]) assert.ok(jobAutoApprovalReason({ title }), title);
  for (const title of ["EOD Technician", "EOD Program Manager", "End of Day Coordinator", "Explosives Handler", "Ordnance Coordinator", "Disposal Manager", "Explosive - Ordnance - Disposal Technician", "UXOLOGY Engineer", "Engineering Portfolio including Explosive Ordnance Disposal"]) assert.equal(jobAutoApprovalReason({ title }), null, title);
  assert.equal(jobAutoApprovalReason({ title: "Program Manager", import_metadata: { description: "Explosive Ordnance Disposal and UXO are part of a large portfolio" } }), null);
});
test("explicit titles remain subject to all exclusions and ReliefWeb suppression", () => {
  for (const title of ["UXO Analyst", "Explosive Ordnance Disposal Police Officer", "UXO Scientist", "Student UXO Technician"]) assert.equal(jobAutoApprovalReason({ title }), null, title);
  assert.equal(jobAutoApprovalReason({ title: "UXO Technician" }, [{ id: "rule", phrase: "uxo technician" }]), null);
  assert.equal(jobAutoApprovalReason({ title: "UXO Technician", source_type: "reliefweb", import_metadata: { suppressed: true } }), null);
  assert.equal(jobAutoApprovalReason({ title: "UXO Technician", source_type: "reliefweb", import_metadata: { relevance_confidence: "low" } }), null);
});
test("import sweep approves only qualifying pending jobs and never creates human feedback", async () => {
  const prior = globalThis.fetch;
  const rows = [
    ["explicit", "Explosive Ordnance Disposal Technician"], ["uxo", "UXO Technician"], ["acronym", "EOD Technician"], ["body", "Program Manager"], ["excluded", "UXO Analyst"],
  ].map(([id, title]) => ({ id, title, company_name: "Example", location: "Tampa", source_type: "linkedin", description: "Explosive Ordnance Disposal support. Bachelor's degree in chemistry required.", og_description: null, import_metadata: {}, apply_url: `https://example.test/jobs/${id}`, is_approved: false, is_rejected: false, created_at: new Date().toISOString() }));
  const approved: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "db.example");
    const table = url.pathname.split("/").pop();
    if (table === "job_type_exclusions") return Response.json([]);
    if (table === "auto_approve_explicit_job") {
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.policy_version, "explicit-ordnance-title-v1");
      assert.equal(payload.expected_job.description.includes("chemistry required"), true, "Specialist degrees do not block explicit titles");
      approved.push(payload.target_job_id); return Response.json(payload.target_job_id);
    }
    assert.equal(table, "jobs"); assert.equal(init?.method ?? "GET", "GET", "No feedback insert or other direct writes");
    return Response.json(rows);
  };
  try {
    const client = createClient("https://db.example", "test", { auth: { persistSession: false, autoRefreshToken: false } });
    assert.equal(await autoApproveExplicitJobs(client, "linkedin"), 2);
    assert.deepEqual(approved, ["explicit", "uxo"]);
  } finally { globalThis.fetch = prior; }
});
