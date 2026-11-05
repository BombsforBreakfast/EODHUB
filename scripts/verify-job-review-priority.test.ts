import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreJobReview, jobReviewPage } from "../app/lib/jobReviewPriority";
const job = (title: string, description = "") => ({ id: title, title, description });
test("explicit phrases in titles and descriptions score 100 without role or degree vetoes", () => {
  for (const phrase of ["Explosive Ordnance Disposal", "Explosive Ordnance", "Countering Weapons of Mass Destruction", "Counter Weapons of Mass Destruction"]) {
    for (const row of [job(`${phrase} Analyst`), job("Police Scientist Intern", `Requires ${phrase}. Bachelor's degree in chemistry required.`)]) assert.equal(scoreJobReview(row).score,100,JSON.stringify(row));
  }
  for (const title of ["UXO Analyst", "Bomb Tech", "Bomb Technician", "CWMD Scientist", "C-WMD Advisor"]) assert.equal(scoreJobReview(job(title)).score,100,title);
});
test("weighted signals remain below explicit matches and keyword repetition does not stack", () => {
  assert.equal(scoreJobReview(job("Supervisor", "UXO experience")).score,85);
  assert.equal(scoreJobReview(job("Explosive Safety Analyst")).score,75);
  assert.equal(scoreJobReview(job("Supervisor", "Explosives experience")).score,60);
  assert.equal(scoreJobReview(job("Supervisor", "UXO ".repeat(30))).score,85);
});
test("word boundaries and visible content prevent accidental matches", () => {
  for (const title of ["UXOLOGY", "Bomb Technical Writer", "Countering Weapons of Mass Destructionology", "Unexplosive product"]) assert.equal(scoreJobReview(job(title)).score,0,title);
  assert.equal(scoreJobReview(job("Coordinator", "<script>UXO</script><style>explosive ordnance</style>")).score,0);
  assert.equal(scoreJobReview(job("Coordinator", "<p>Explosive <b>Ordnance</b> Disposal</p>")).score,100);
});
test("all jobs remain in globally ranked review across pagination and explicit priorities survive", () => {
  const rows=[job("Office Manager"),job("UXO Analyst"),job("Supervisor","UXO"),job("Explosive Safety")];
  const page=jobReviewPage(rows,"all",0,2);
  assert.equal(page.totalCount,4);assert.equal(page.jobs[0].title,"UXO Analyst");assert.equal(page.jobs[1].review_priority.score,85);
  assert.equal(jobReviewPage(rows,"all",2,2).jobs[1].title,"Office Manager");
  const priorities={exclusions:[],signals:[],priorities:[{id:"yes",phrase:"office manager",mission_required:false,target_score:100 as const}]};
  assert.equal(scoreJobReview(rows[0],priorities).score,100);
  assert.equal(scoreJobReview({...rows[0],gold_highlight:true}).score,100);
});
