import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobAutoApprovalReason } from "../app/lib/jobAutoApproval";
import { autoApproveExplicitJobs, autoApproveAfterImport } from "../app/lib/server/autoApproveExplicitJobs";
test("even explicit 100-point titles never auto approve", () => {
  for (const title of ["Explosive Ordnance Disposal Technician","UXO Technician","Bomb Technician","CWMD Specialist"]) assert.equal(jobAutoApprovalReason({title}),null);
});
test("all importer approval hooks are no-ops with no database reads or writes", async () => {
  const client = new Proxy({}, { get() { throw new Error("Automatic approval accessed database"); } }) as SupabaseClient;
  for (const source of ["adzuna","linkedin","usajobs","reliefweb"]) {
    assert.equal(await autoApproveExplicitJobs(client,source),0);
    assert.equal(await autoApproveAfterImport(client,source,[]),0);
  }
});
