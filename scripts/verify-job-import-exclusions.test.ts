import assert from "node:assert/strict";
import { test } from "node:test";
import { jobImportExclusionReason } from "../app/lib/jobImportExclusions";
import { scoreAdzunaJob } from "../app/lib/adzuna/relevance";
import { scoreUSAJobsJob } from "../app/lib/usajobs/relevance";
import { scoreLinkedInJob } from "../app/lib/linkedin/relevance";
import { scoreReliefWebJob } from "../app/lib/reliefweb/scoreReliefWebJob";
import { isReliefWebJobSuppressed } from "../app/lib/reliefweb/publicVisibility";
import { ADZUNA_WHAT_EXCLUDE } from "../app/lib/adzuna/intakeConfig";
test("only the owner-authorized title terms are blocked", () => {
 for (const title of ["Paramedic", "Senior PARAMEDIC", "Firefighter/Paramedic", "Paramedics - overseas", "Chemical Technicians (74D)", "74d CBRN Specialist", "EMT-Basic", "EMTs - overseas", "Senior Firefighter", "Firefighters", "Military POLICE Officer", "Police Bomb Technician"]) {
  assert.ok(jobImportExclusionReason(title),title);
 }
 for (const title of ["EOD Technician", "CWMD Policy SME", "Paramedical Researcher", "74Delta Analyst", "174D Analyst", "EMTech Engineer", "Policy SME", "Policework Analyst"]) {
  assert.equal(jobImportExclusionReason(title,"Paramedic 74D EMT Firefighter Police employer"),null,title);
 }
});
test("all sources retain formerly excluded titles, including description-only and zero-score search results", () => {
 for(const title of ["UXO Analyst","Intern","National Guard Recruiter","Medical Technician","Scientist","Accountant"]) {
  assert.equal(jobImportExclusionReason(title),null);
  for(const description of ["Explosive Ordnance Disposal support","General responsibilities"]) {
    const base={title,description,companyName:"Example"};
    assert.equal(scoreAdzunaJob(base).relevant,true);
    assert.equal(scoreLinkedInJob(base).relevant,true);
    assert.equal(scoreUSAJobsJob({...base,organizationName:"Example"}).relevant,true);
    const relief=scoreReliefWebJob({...base,metadataText:""});
    assert.equal(relief.excluded,false);assert.equal(relief.suppressed,false);assert.equal(relief.needsReview,true);
  }
 }
 assert.equal(ADZUNA_WHAT_EXCLUDE,"");
 assert.equal(isReliefWebJobSuppressed("reliefweb",{suppressed:true,relevance_confidence:"low"}),false);
});
