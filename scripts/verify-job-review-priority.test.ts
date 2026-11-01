import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreJobReview, jobReviewPage } from "../app/lib/jobReviewPriority";
const job = (title: string, description = "") => ({ id: title, title, description, company_name: "Example employer", created_at: "2026-10-30T00:00:00Z" });
test("direct technician titles receive top priority and other specialty titles remain strong", () => {
  for (const title of ["EOD Technician", "Explosive Ordnance Disposal Advisor", "Explosives Handler", "IED Trainer", "CIED Specialist", "C-IED Specialist", "CBRN Instructor", "CBRNE Advisor", "CWMD Manager", "WMD Specialist", "Ordnance Coordinator", "UXO Technician", "UAS Operator", "Drone Operator", "Mine Action Manager", "Humanitarian Mine Action Advisor", "Demining Supervisor"]) {
    assert.equal(scoreJobReview(job(title)).score, ["EOD Technician","UXO Technician"].includes(title)?100:70, title);
    assert.equal(scoreJobReview(job(title)).band, "high", title);
  }
});
test("description-only evidence is capped below strong matches and repetitions do not inflate scores", () => {
  assert.equal(scoreJobReview(job("Program Manager", "EOD UXO CBRN WMD UAS mine action explosives")).score, 60);
  assert.equal(scoreJobReview(job("Program Manager", "EOD UXO CBRN WMD UAS mine action explosives")).band, "possible");
  assert.equal(scoreJobReview(job("CBRN CBRNE CBRN Instructor")).score, scoreJobReview(job("CBRN Instructor")).score);
  assert.equal(scoreJobReview(job("Explosive Ordnance Disposal Advisor")).score, scoreJobReview(job("EOD Advisor")).score);
  assert.equal(scoreJobReview(job("EOD Technician", "EOD ".repeat(100))).score, 100);
});
test("incidental words, employer names, HTML code and hard exclusions do not become priority jobs", () => {
  for (const title of ["Security Clearance Coordinator", "Property Disposal Manager", "Classified Systems Engineer", "Direct Action Coordinator"]) assert.equal(scoreJobReview(job(title)).score, 0, title);
  assert.equal(scoreJobReview({ ...job("Accounts Assistant"), company_name: "EOD employer" }).score, 0);
  assert.equal(scoreJobReview(job("Assistant", "<script>EOD</script><style>UXO</style>")).score, 0);
  assert.equal(scoreJobReview(job("EOD Analyst", "EOD UXO WMD")).score, 0);
  assert.equal(scoreJobReview(job("IT Specialist - UAS", "EOD")).score, 0);
});
test("filtering and global ranking happen before pagination, with counts for every tier", () => {
  const rows = [job("Accounts Assistant"), job("UAS Operator", "UAS work"), job("EOD Technician"), job("Program Manager", "CWMD mission")];
  const page = jobReviewPage(rows, "high", 0, 1);
  assert.equal(page.jobs[0].title, "EOD Technician");
  assert.equal(page.totalCount, 2);
  assert.deepEqual(page.priorityCounts, { high: 2, possible: 1, low: 1, all: 4, gold:0 });
  assert.equal(jobReviewPage(rows, "high", 1, 1).jobs[0].title, "UAS Operator");
  assert.equal(jobReviewPage(rows, "all", 0, 25).totalCount, 4);
});
