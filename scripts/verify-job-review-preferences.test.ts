import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreJobReview, jobReviewPage } from "../app/lib/jobReviewPriority";
import { jobDegreePenalty } from "../app/lib/jobDegreeRequirements";
import { learnedJobSignals, learnedJobAdjustment, matchesJobPhrase, type JobReviewFeedback } from "../app/lib/jobReviewPreferences";
import { JobImportMemory, filterRememberedJobs } from "../app/lib/server/jobImportMemory";
import { createClient } from "@supabase/supabase-js";

test("only engineering, chemistry and biology degrees have a small non-stacking score penalty", () => {
  for (const subject of ["engineering", "chemistry", "biology"]) {
    for (const text of [`Bachelor's degree in ${subject} required.`, `Master’s degree in ${subject} required.`, `Ph.D. in ${subject} required.`, `B.S. in ${subject} required.`, `Must hold a ${subject} degree.`]) assert.equal(jobDegreePenalty(text).points, 10, text);
    for (const text of [`${subject} degree preferred.`, `Bachelor's degree in ${subject} or equivalent experience.`]) assert.equal(jobDegreePenalty(text).points, 5, text);
    for (const text of [`${subject} experience required.`, `${subject} degree not required.`, `No ${subject} degree required.`, `Degree in ${subject} is not mandatory.`]) assert.equal(jobDegreePenalty(text).points, 0, text);
  }
  for (const text of ["Bachelor's degree required.", "Degree in history required.", "Bachelor's degree in any field. Engineering experience preferred.", "Bachelor's degree in any field and engineering experience required.", "Engineering department requires a degree in history."]) assert.equal(jobDegreePenalty(text).points, 0, text);
  assert.equal(jobDegreePenalty("Degree in engineering, chemistry or biology required.").points, 10);
  const technical = { id: "engineering", title: "EOD Engineer", description: "EOD work. Bachelor's degree in engineering required." };
  const handsOn = { id: "technician", title: "EOD Technician", description: "EOD work." };
  assert.equal(scoreJobReview(technical).score, 75);
  assert.equal(scoreJobReview(technical).band, "high");
  assert.match(scoreJobReview(technical).reasons[0], /engineering degree/);
  assert.equal(jobReviewPage([technical, handsOn], "all", 0, 25).jobs[0].id, "technician");
  assert.equal(scoreJobReview({ ...technical, description: null, og_description: technical.description }).score, 75);
});
const feedback = (count: number, decision: JobReviewFeedback["decision"], title = "EOD Technician"): JobReviewFeedback[] => Array.from({ length: count }, (_, i) => ({ job_id: `${decision}-${i}`, title, company_name: `Employer ${i}`, location: "Tampa", decision }));
test("learning requires three distinct consistent examples, deduplicates reposts and caps overlapping signals", () => {
  assert.deepEqual(learnedJobSignals(feedback(2, "approved")), []);
  const positives = learnedJobSignals(feedback(3, "approved"));
  assert.equal(learnedJobAdjustment("Senior EOD Technician", positives).points, 6);
  assert.equal(learnedJobAdjustment("EOD Technician", learnedJobSignals(feedback(30, "approved"))).points, 10);
  assert.equal(learnedJobAdjustment("EOD Technician", learnedJobSignals(feedback(30, "not_relevant"))).points, -10);
  assert.deepEqual(learnedJobSignals([...feedback(3, "approved"), ...feedback(3, "not_relevant")]), positives, "newest decision for an exact repost wins");
  assert.deepEqual(learnedJobSignals(Array.from({ length: 10 }, () => feedback(1, "approved")[0])), []);
  assert.deepEqual(learnedJobSignals(feedback(5, "approved", "Senior Technician")), [], "generic adjective phrases are not learned");
  assert.equal(learnedJobAdjustment("UXO Technician", positives).points, 0);
});
test("absolute exclusions beat learned boosts; learning cannot promote body-only jobs to strong matches", () => {
  const preferences = { exclusions: [{ id: "custom", phrase: "eod technician" }], signals: learnedJobSignals(feedback(10, "approved")) };
  assert.equal(scoreJobReview({ id: "x", title: "Senior EOD Technician" }, preferences).score, 0);
  assert.equal(scoreJobReview({ id: "x", title: "EOD Analyst" }, { ...preferences, exclusions: [] }).score, 0);
  const bodyOnly = scoreJobReview({ id: "x", title: "Program Manager", description: "EOD UXO CBRN WMD UAS mine action" }, { exclusions: [], signals: learnedJobSignals(feedback(10, "approved", "Program Manager")) });
  assert.equal(bodyOnly.score, 69); assert.equal(bodyOnly.band, "possible");
  assert.equal(matchesJobPhrase("Police-Officer", "police officer"), true);
  assert.equal(matchesJobPhrase("Policy Manager", "police"), false);
});
test("custom type exclusions block future imports even with no exact-listing memory", async () => {
  const memory = new JobImportMemory([], Date.now(), [{ id: "rule", phrase: "helicopter pilot" }]);
  const client = createClient("https://db.example", "test", { global: { fetch: async () => { throw new Error("No database mutation expected"); } } });
  const result = await filterRememberedJobs(client, [{ title: "Senior Helicopter Pilot", companyName: "New employer" }, { title: "UXO Technician", companyName: "New employer" }], x => x, memory);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.candidates.map(x => x.title), ["UXO Technician"]);
});
