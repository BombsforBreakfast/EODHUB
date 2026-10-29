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
  for (const title of ["EMF EOD Technician", "UXO Technician III", "C-IED Specialist", "UAS Operator", "WMD Specialist"]) {
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


test("intern titles are excluded across all importers without matching international", () => {
  for (const title of ["EOD Intern", "INTERN - UXO", "UAS Interns", "CBRN Internship", "WMD Internships"]) {
    const input = { title, description, companyName: "EOD employer" };
    assert.equal(jobImportExclusionReason(title), "Intern role", title);
    assert.equal(scoreAdzunaJob(input, { intakeChannel: "body:eod@us" }).relevant, false, title);
    assert.equal(scoreUSAJobsJob({ title, description, organizationName: "Defense EOD" }).relevant, false, title);
    assert.equal(linkedInHardExcludeReason(input), "Intern role", title);
    assert.equal(scoreLinkedInJob(input).relevant, false, title);
    assert.equal(scoreReliefWebJob({ title, description, metadataText: "Mine Action", themes: ["Mine Action"] }).excluded, true, title);
  }
  assert.equal(jobImportExclusionReason("International EOD Advisor"), null);
  assert.equal(jobImportExclusionReason("Internal UXO Operations Specialist"), null);
});

test("newly excluded role titles are blocked across all importers", () => {
  const cases: Array<[string, string[]]> = [
    ["EMS role", ["EMS", "EMS Lieutenant - CBRN", "E.M.S. Instructor", "E M S Technician - EOD Range", "Emergency Medical Services Director", "Emergency-Medical-Service Supervisor", "Emergency Medical Svcs Coordinator", "EOD / EMS Response Specialist"]],
    ["Sheriff role", ["Sheriff", "Deputy Sheriff", "Sheriff's Deputy", "Sheriff’s Deputy - Bomb Squad", "SHERIFFS DEPUTY - EOD", "Deputy-Sheriff Trainee", "Undersheriff", "Under-Sheriff", "Sheriff - UAS Pilot"]],
    ["Decontamination specialist role", ["Decontamination Specialist", "CBRN DECONTAMINATION SPECIALISTS", "Senior Decontamination-Specialist", "Decontamination Specialist - EOD Range"]],
    ["Human resources role", ["Human Resources Specialist - EOD", "HUMAN RESOURCE MANAGER", "Human-Resources Advisor (UAS)", "HR Business Partner", "EOD HR Assistant", "HR Analyst ($40/hr)"]],
    ["Budget role", ["Budget Analyst - EOD", "BUDGETS Officer", "CBRN Budgeting Specialist", "Budgetary Manager", "UAS Program Budget Coordinator"]],
    ["Postdoctoral role", ["Postdoctoral Researcher - EOD", "POSTDOCTORAL FELLOW - UAS", "Post-doctoral CBRN Scientist", "Post Doctoral Research Associate", "Post–Doctoral WMD Analyst"]],
    ["Student role", ["Student EOD Technician", "STUDENTS - UXO Program", "Working Student (UAS)", "EOD Studentship", "CBRN Studentships"]],
    ["Police officer role", ["Police Officer", "POLICE OFFICERS - EOD", "Supervisory Police Officer (Bomb Squad)", "Police-Officer Trainee", "Police/Officer - Explosive Detection"]],
    ["Analyst role", ["Analyst", "ANALYSTS", "All Source Analyst", "Senior All-Source Intelligence Analyst", "All–Source Targeting Analyst", "Intelligence Analyst (All Source)", "Allsource Analyst - Counter-IED", "All-Source Analysts", "WMD Analyst", "Open Source Analyst", "EOD Research Analyst", "CBRN Analysts", "UAS Analyst", "UXO Analyst(s)"]],
    ["Scientist role", ["Scientist", "SCIENTISTS", "EOD Research Scientist", "Senior CBRN Scientist", "UAS Data Scientist", "WMD Scientists", "UXO Scientist(s)"]],
    ["Firefighter role", ["Firefighter", "FIREFIGHTERS - CBRN", "Fire Fighter (HAZMAT)", "Airport Fire-Fighter", "Supervisory Firefighter - EOD Range"]],
    ["Nurse role", ["Nurse", "Registered Nurses", "Nurse Practitioner - CBRN", "Occupational Health Nursing", "RN - EOD Range", "LPN / CBRN", "LVN - Defense Clinic", "APRN", "CRNA", "R.N. - Range Clinic"]],
  ];
  for (const [reason, titles] of cases) {
    for (const title of titles) {
      const input = { title, description, companyName: "EOD employer" };
      assert.equal(jobImportExclusionReason(title), reason, title);
      assert.equal(scoreAdzunaJob(input, { intakeChannel: "body:eod@us" }).relevant, false, `Adzuna: ${title}`);
      assert.equal(scoreUSAJobsJob({ ...input, organizationName: "Defense EOD" }, { intakeChannel: "title:eod" }).relevant, false, `USAJOBS: ${title}`);
      assert.equal(linkedInHardExcludeReason(input), reason, title);
      assert.equal(scoreLinkedInJob(input, { searchQuery: "EOD" }).relevant, false, `LinkedIn: ${title}`);
      assert.equal(shouldExcludeReliefWebJob(title, description, "Mine Action"), true, title);
      const rw = scoreReliefWebJob({ title, description, metadataText: "Mine Action", themes: ["Mine Action"] });
      assert.equal(rw.excluded, true, `ReliefWeb: ${title}`);
      assert.equal(rw.score, 0, title);
    }
  }
});

test("relevant specialist roles remain eligible when excluded roles are mentioned only in the description", () => {
  const context = `${description} Coordinate with police officers, analysts, scientists, firefighters, nurses, EMS, emergency medical services, sheriff's deputies and decontamination specialists; RN support is available. Train students and postdoctoral researchers. Coordinate with human resources and HR on the program budget.`;
  for (const title of ["EOD Technician", "UXO Technician III", "C-IED Specialist", "UAS Operator", "WMD Specialist", "EOD Technician ($40/hr)", "UXO Technician - $40 per hr"]) {
    const input = { title, description: context, companyName: "EOD employer" };
    assert.equal(jobImportExclusionReason(title), null, title);
    assert.equal(scoreAdzunaJob(input).relevant, true, title);
    assert.equal(scoreUSAJobsJob({ ...input, organizationName: "Defense" }).relevant, true, title);
    assert.equal(scoreLinkedInJob(input).relevant, true, title);
    assert.equal(scoreReliefWebJob({ ...input, metadataText: "Mine Action", themes: ["Mine Action"] }).excluded, false, title);
  }
  for (const title of ["Police EOD Technician", "All-Source EOD Instructor", "Scientific Equipment Technician", "Fire Protection Engineer", "Nursery Equipment Technician", "URN Systems Engineer", "Deputy EOD Program Manager", "Systems Engineer", "EM Systems Engineer"]) {
    assert.equal(jobImportExclusionReason(title), null, title);
  }
});
