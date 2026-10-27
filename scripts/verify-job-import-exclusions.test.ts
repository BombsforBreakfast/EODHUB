import assert from "node:assert/strict";
import { test } from "node:test";
import { jobImportExclusionReason } from "../app/lib/jobImportExclusions";
import { scoreAdzunaJob } from "../app/lib/adzuna/relevance";
import { scoreUSAJobsJob } from "../app/lib/usajobs/relevance";
import { linkedInHardExcludeReason, scoreLinkedInJob } from "../app/lib/linkedin/relevance";
import { scoreReliefWebJob, shouldExcludeReliefWebJob } from "../app/lib/reliefweb/scoreReliefWebJob";

const excludedTitles = ["EMT", "EMT-B", "EMT-P / CBRN Response", "Firefighter/EMT", "AEMT - Explosive Range", "NREMT Instructor", "E.M.T. Instructor", "Emergency Medical Technician", "Emergency Medical Technicians", "Emergency-Medical-Tech (EOD Range)", "Paramedic", "Firefighter/Paramedic", "Flight Paramedics", "EOD Paramedic", "Paramedicine Instructor", "Para-Medic"];
const description = "Support explosive ordnance disposal, EOD and UXO operations, mine action, counter-IED, CBRN, WMD and unmanned aerial UAS programs.";

test("EMT and Paramedic titles are hard-excluded across all importers despite strong relevance signals", () => {
  for (const title of excludedTitles) {
    const input = { title, description, companyName: "EOD employer" };
    assert.equal(jobImportExclusionReason(title), "EMT / Paramedic role", title);
    assert.equal(scoreAdzunaJob(input, { intakeChannel: "body:eod@us" }).relevant, false, `Adzuna: ${title}`);
    assert.equal(scoreUSAJobsJob({ title, description, organizationName: "Defense EOD" }, { intakeChannel: "title:eod" }).relevant, false, `USAJOBS: ${title}`);
    assert.equal(linkedInHardExcludeReason(input), "EMT / Paramedic role", title);
    assert.equal(scoreLinkedInJob(input, { searchQuery: "EOD" }).relevant, false, `LinkedIn: ${title}`);
    assert.equal(shouldExcludeReliefWebJob(title, description, "Mine Action"), true, title);
    const rw = scoreReliefWebJob({ title, description, metadataText: "Mine Action", themes: ["Mine Action"] });
    assert.equal(rw.excluded, true, `ReliefWeb: ${title}`);
    assert.equal(rw.score, 0, title);
  }
});

test("qualified EOD, UXO, C-IED, UAS and WMD roles are retained when EMT or paramedic appears only in the description", () => {
  for (const title of ["EMF EOD Technician", "UXO Technician III", "C-IED Specialist", "UAS Operator", "WMD Analyst"]) {
    const input = { title, description: `${description} EMT certification is helpful; coordinate with paramedic teams.`, companyName: "EOD employer" };
    assert.equal(jobImportExclusionReason(title), null, title);
    assert.equal(scoreAdzunaJob(input).relevant, true, title);
    assert.equal(scoreUSAJobsJob({ ...input, organizationName: "Defense" }).relevant, true, title);
    assert.equal(scoreLinkedInJob(input).relevant, true, title);
    assert.equal(scoreReliefWebJob({ ...input, metadataText: "Mine Action", themes: ["Mine Action"] }).excluded, false, title);
  }
  assert.equal(jobImportExclusionReason("Parametric Systems Engineer"), null);
  assert.equal(jobImportExclusionReason("Equipment Maintenance Technician"), null);
});

