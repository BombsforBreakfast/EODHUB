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
    ["Language-enabled OSINT collector role", ["Language-Enabled OSINT Collector", "LANGUAGE ENABLED OSINT COLLECTORS", "Language–Enabled OSINT Collector\u00a0"]],
    ["Position Navigation and Timing role", ["Position Navigation and Timing Specialist", "Positioning, Navigation, and Timing Engineer", "Position Navigation & Timing Coordinator", "PNT Engineer", "P.N.T. Specialist"]],
    ["Acquisition role", ["Acquisition Specialist", "ACQUISITIONS Manager", "EOD Acquisition Coordinator"]],
    ["Multi-discipline security specialist role", ["MULTI-DISCIPLINE SECURITY SPECIALIST", "Multi Discipline Security Specialists", "Multidisciplinary Security Specialist"]],
    ["Chemical technician role", ["Chemical Technicians", "CHEMICAL TECHNICIAN", "Chemical-Tech", "EOD Chemical Technician II"]],
    ["Legal role", ["Legal Specialist", "LEGAL ASSISTANT - EOD", "Attorney Advisor", "Lawyer", "Paralegals", "General Counsel", "Law-Clerk"]],
    ["Telephony role", ["Telephony Engineer", "IP TELEPHONY SPECIALIST", "EOD Telephony Support"]],
    ["Medic role", ["Medic", "Flight Medics", "EOD Medic", "Combat Medic - CBRN"]],
    ["Epidemiology role", ["Epidemiology Specialist", "Epidemiologist", "Epidemiologists", "Epidemiological Officer"]],
    ["Postdoctoral role", ["Postdoc", "POSTDOCS - UAS", "Post-doc Fellow", "EOD Post Doc Researcher"]],
    ["Machinist role", ["Machinist", "MACHINISTS", "EOD Machinist"]],
    ["Dispatcher role", ["Dispatcher", "DISPATCHERS", "Emergency Dispatcher", "UAS Flight Dispatcher"]],
    ["Public utility role", ["Public Utility Specialist", "Public Utilities Coordinator", "PUBLIC-UTILITIES Supervisor"]],
    ["J4 role", ["J4", "j4 specialist", "J-4 Logistics", "J 4 EOD Coordinator"]],
    ["Air Force A10 listing", ["Air Force A10 - EOD Program Manager", "USAF/A10 UXO Coordinator", "Air-Force A-10 UAS Specialist"]],
    ["IT specialist role", ["IT Specialist", "it specialists", "Supervisory IT Specialist (INFOSEC)", "I.T. Specialist - EOD", "IT Support Specialist", "IT Cybersecurity Specialist", "IT Customer Support Specialist", "Information Technology Specialist", "Information-Technology Specialist - UAS", "Information Technology (IT) Specialist", "Information Technology Specialist (SYSADMIN)"]],
    ["J39 role", ["J39", "j39 specialist", "J-39 EOD Planner", "J 39 Advisor", "J3/9 Operations Specialist", "J-3/9 Coordinator", "CWMD J39 Support", "J39/UAS Support"]],
    ["MDDU role", ["MDDU", "mddu technician", "MDDU - EOD Operations", "CBRN MDDU Specialist", "M.D.D.U. Coordinator", "M D D U Operator", "MDDU/UAS Support", "M-D-D-U Technician"]],
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
  const context = `${description} Coordinate with police officers, analysts, scientists, firefighters, nurses, EMS, MDDU, J39, J4, Air Force A10, IT specialists, information technology specialists, emergency medical services, sheriff's deputies and decontamination specialists; RN support is available. Train students and postdoctoral researchers. Coordinate with human resources and HR on the program budget. Coordinate with legal, telephony, medic, epidemiology, postdoc, machinist, dispatcher and public utility teams.`;
  for (const title of ["EOD Technician", "UXO Technician III", "C-IED Specialist", "UAS Operator", "WMD Specialist", "EOD Technician ($40/hr)", "UXO Technician - $40 per hr"]) {
    const input = { title, description: context, companyName: "EOD employer" };
    assert.equal(jobImportExclusionReason(title), null, title);
    assert.equal(scoreAdzunaJob(input).relevant, true, title);
    assert.equal(scoreUSAJobsJob({ ...input, organizationName: "Defense" }).relevant, true, title);
    assert.equal(scoreLinkedInJob(input).relevant, true, title);
    assert.equal(scoreReliefWebJob({ ...input, metadataText: "Mine Action", themes: ["Mine Action"] }).excluded, false, title);
  }
  for (const title of ["Police EOD Technician", "All-Source EOD Instructor", "Scientific Equipment Technician", "Fire Protection Engineer", "Nursery Equipment Technician", "URN Systems Engineer", "Deputy EOD Program Manager", "Systems Engineer", "EM Systems Engineer", "J390 Systems Engineer", "J3 Specialist", "J9 Advisor", "Satellite Specialist", "Explosive Safety Specialist", "Information Management Specialist", "Chemical Safety Specialist", "Counseling Coordinator", "J40 Specialist"]) {
    assert.equal(jobImportExclusionReason(title), null, title);
  }
});

test("Air Force A10 employers are excluded even when the job title has no A10 label", () => {
  const title = "EOD Technician";
  for (const employer of ["Air Force A10", "U.S. Air Force A-10", "Headquarters USAF/A10", "AIR FORCE A 10", "Air-Force A–10"]) {
    const input = { title, description, companyName: employer };
    assert.equal(jobImportExclusionReason(title, employer), "Air Force A10 listing", employer);
    assert.equal(scoreAdzunaJob(input, { intakeChannel: "body:eod@us" }).relevant, false, employer);
    assert.equal(scoreUSAJobsJob({ title, description, organizationName: employer }).relevant, false, employer);
    assert.equal(linkedInHardExcludeReason(input), "Air Force A10 listing", employer);
    assert.equal(scoreLinkedInJob(input).relevant, false, employer);
    assert.equal(scoreReliefWebJob({ title, description, metadataText: `${employer} Mine Action`, themes: ["Mine Action"] }).excluded, true, employer);
  }
  assert.equal(scoreUSAJobsJob({ title, description, organizationName: "Air Force", departmentName: "A10" }).relevant, false);
  assert.equal(scoreAdzunaJob({ title: "A10 EOD Program Manager", description, companyName: "Air Force" }).relevant, false);
});

test("other Air Force employers and unrelated A10 labels remain eligible", () => {
  const title = "EOD Technician";
  for (const employer of ["Department of the Air Force", "USAF", "A10 Networks", "Air Force A100"]) {
    const input = { title, description, companyName: employer };
    assert.equal(jobImportExclusionReason(title, employer), null, employer);
    assert.equal(scoreAdzunaJob(input).relevant, true, employer);
    assert.equal(scoreUSAJobsJob({ title, description, organizationName: employer }).relevant, true, employer);
    assert.equal(scoreLinkedInJob(input).relevant, true, employer);
    assert.equal(scoreReliefWebJob({ title, description, metadataText: `${employer} Mine Action`, themes: ["Mine Action"] }).excluded, false, employer);
  }
});
