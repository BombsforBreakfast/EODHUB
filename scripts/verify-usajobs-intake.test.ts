import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { extractUSAJobsSummary, fetchUSAJobsSearch, type USAJobsApiItem } from "../app/lib/usajobs/api";
import { USAJOBS_KEYWORD_CHANNELS, USAJOBS_SERIES_CHANNELS, USAJOBS_ORGANIZATION_CHANNELS, USAJOBS_TITLE_CHANNELS } from "../app/lib/usajobs/intakeConfig";
import { detectUSAJobsCategory, scoreUSAJobsJob } from "../app/lib/usajobs/relevance";

const fixture = (title: string, summary: string, qualifications = "", duties: string | string[] = []): USAJobsApiItem => ({ MatchedObjectId: "888531000", MatchedObjectDescriptor: { PositionID: "AGENCY-ANNOUNCEMENT", PositionTitle: title, PositionURI: "https://www.usajobs.gov/job/888531000", PositionLocationDisplay: "Arlington, VA", OrganizationName: "Department of the Air Force", QualificationSummary: qualifications, UserArea: { Details: { JobSummary: summary, MajorDuties: duties } } } });
test("qualifications and duties remain available even when a generic summary exists", () => {
  const text = extractUSAJobsSummary(fixture("PROGRAM ANALYST", "Support agency readiness.", "Expertise in CWMD doctrine.", ["Lead CWMD exercise planning."]));
  assert.match(text,/Support agency readiness/); assert.match(text,/CWMD doctrine/); assert.match(text,/exercise planning/);
  const relevance = scoreUSAJobsJob({ title: "PROGRAM ANALYST", description: text, organizationName: "Air Force" });
  assert.equal(relevance.relevant,true); assert.equal(detectUSAJobsCategory("PROGRAM ANALYST",text),"CWMD");
});
test("single-string duties and the old qualification-only response are retained", () => {
  assert.match(extractUSAJobsSummary(fixture("ANALYST", "", "", "CWMD operations")),/CWMD operations/);
  const item = fixture("ANALYST", "", "Explosive ordnance disposal expertise.");
  delete item.MatchedObjectDescriptor.UserArea;
  assert.equal(extractUSAJobsSummary(item),"Explosive ordnance disposal expertise.");
});
test("new matching is additive and preserves explicit title categories and exclusions", () => {
  for (const title of ["MUNITIONS DISPOSAL SPECIALIST", "EXPLOSIVE SAFETY SPECIALIST", "EXPLOSIVES SAFETY SPECIALIST"]) {
    assert.equal(scoreUSAJobsJob({title,description:"",organizationName:"Defense"}).relevant,true);
    assert.equal(detectUSAJobsCategory(title,"CWMD mission"),"EOD");
  }
  assert.equal(scoreUSAJobsJob({title:"ACCOUNTANT",description:"Financial statements and reporting.",organizationName:"Agency"}).relevant,false);
  assert.equal(scoreUSAJobsJob({title:"NATIONAL GUARD RECRUITER",description:"CWMD programs",organizationName:"Army"}).relevant,false);
  assert.equal(detectUSAJobsCategory("Emergency Management Specialist","CWMD doctrine"),"EM");
  assert.equal(detectUSAJobsCategory("UXO TECHNICIAN","CWMD doctrine"),"UXO");
  assert.equal(detectUSAJobsCategory("CBRN SPECIALIST","CWMD doctrine"),"CBRN");
});
test("the old channel definitions remain byte-for-byte equivalent", () => {
  const original = JSON.parse(fs.readFileSync("scripts/fixtures/usajobs-intake-baseline.json","utf8"));
  assert.deepEqual(USAJOBS_KEYWORD_CHANNELS.slice(0,original.keyword.length),original.keyword);
  assert.deepEqual(USAJOBS_SERIES_CHANNELS,original.series);
  assert.deepEqual(USAJOBS_ORGANIZATION_CHANNELS,original.organization);
  assert.deepEqual(USAJOBS_TITLE_CHANNELS,original.title);
});
test("API keeps the existing date default, requests Full fields, and only explicitly open searches omit DatePosted", async () => {
  const oldFetch=globalThis.fetch, oldKey=process.env.USAJOBS_API_KEY, oldEmail=process.env.USAJOBS_EMAIL;
  process.env.USAJOBS_API_KEY="test-key";process.env.USAJOBS_EMAIL="test@example.com";
  const urls: URL[]=[];
  globalThis.fetch=async input=>{urls.push(new URL(String(input)));return Response.json({SearchResult:{SearchResultItems:[]}})};
  try {
    await fetchUSAJobsSearch({keyword:"CWMD",page:1});
    await fetchUSAJobsSearch({keyword:"CWMD",page:1,datePosted:null});
    assert.equal(urls[0].searchParams.get("DatePosted"),"60");
    assert.equal(urls[1].searchParams.has("DatePosted"),false);
    assert.ok(urls.every(url=>url.searchParams.get("Fields")==="Full"));
    assert.ok(USAJOBS_KEYWORD_CHANNELS.some(channel=>channel.keyword==="CWMD" && channel.datePosted===null));
  } finally {globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.USAJOBS_API_KEY;else process.env.USAJOBS_API_KEY=oldKey;if(oldEmail===undefined)delete process.env.USAJOBS_EMAIL;else process.env.USAJOBS_EMAIL=oldEmail;}
});
