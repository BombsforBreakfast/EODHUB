import test from "node:test";
import assert from "node:assert/strict";
import { deriveJobFacets, formatJobPay, parseFacetOverrides } from "../app/lib/jobFacets";
import { applyJobFilters, DEFAULT_JOB_FILTERS, jobFilterChips, jobRegions, resolveJobLocation, restoreJobFilters, uniqueJobRegionOptions, US_JOB_REGION_GROUPS, toggleJobRegionGroup, type JobListItem } from "../app/lib/jobFilters";
import { jobEmployerIdentity, uniqueJobEmployerOptions } from "../app/lib/jobEmployers";
import { fetchApprovedJobs } from "../app/lib/queries/jobs";
import { adzunaFilterSource } from "../app/lib/adzuna/api";
import { extractUSAJobsFullDescription, extractUSAJobsSummary, usajobsFilterData, type USAJobsApiItem } from "../app/lib/usajobs/api";
const job = (overrides: Partial<JobListItem> = {}): JobListItem => ({ id: "1", created_at: "2026-10-28T00:00:00Z", title: "UXO Technician", category: "EOD", location: "Pensacola, FL", pay_min: null, pay_max: null, clearance: null, description: null, apply_url: null, company_name: "Employer", source_type: "community", og_title: null, og_description: null, og_image: null, og_site_name: null, ...overrides });

test("missing details remain unknown; imported EOD category does not imply direct work", () => {
  const f = deriveJobFacets(job({ title: "Program Manager" }));
  assert.equal(f.relevance, "transferable"); assert.equal(f.education, "unknown"); assert.equal(f.workplace, "unknown"); assert.equal(f.clearance, "unknown");
  assert.equal(deriveJobFacets(job()).relevance, "direct");
  assert.equal(deriveJobFacets(job({ title: "EOD Software Engineer" })).relevance, "related");
  assert.equal(deriveJobFacets(job({ title: "Advisor", description: "Humanitarian mine action" })).relevance, "related");
});
test("education distinguishes required, preferred, no degree and substitution", () => {
  for (const [description, expected] of [["No college degree required.", "none"], ["No degree required.", "none"], ["A bachelor's degree is required.", "required"], ["Bachelor's degree preferred.", "preferred"], ["Bachelor's degree preferred, Secret clearance required.", "preferred"], ["Bachelor's degree or equivalent experience.", "equivalent"], ["We offer college tuition reimbursement.", "unknown"]]) assert.equal(deriveJobFacets(job({ description })).education, expected, description);
});
test("clearance timing and negations; remote site is not remote employment", () => {
  assert.equal(deriveJobFacets(job({ description: "Must hold an active TS/SCI clearance." })).clearanceStatus, "active");
  assert.equal(deriveJobFacets(job({ description: "Ability to obtain Secret clearance." })).clearanceStatus, "obtainable");
  assert.equal(deriveJobFacets(job({ description: "No secret clearance required." })).clearance, "none");
  assert.equal(deriveJobFacets(job({ description: "Work at remote sites. Federal contract support." })).workplace, "unknown");
  assert.equal(deriveJobFacets(job({ description: "This is not a remote position." })).workplace, "onsite");
  assert.equal(deriveJobFacets(job({ description: "Federal contract support." })).employment, "unknown");
  assert.equal(deriveJobFacets(job({ clearance: "Secret", description: "An active security clearance is required." })).clearanceStatus, "active");
  assert.equal(deriveJobFacets(job({ clearance: "Q Access Authorization" })).clearance, "other");
  assert.equal(deriveJobFacets(job({ clearance: "Sensitive Compartmented Information" })).clearance, "sci");
  assert.equal(deriveJobFacets(job({ clearance: "Not Required" })).clearance, "none");
  assert.equal(deriveJobFacets(job({ description: "Maintain hybrid vehicles." })).workplace, "unknown");
});
test("admin corrections override source; malformed values are ignored", () => {
  assert.deepEqual(parseFacetOverrides({ relevance: "direct", education: "bogus", is_admin: true }), { relevance: "direct" });
  assert.equal(deriveJobFacets(job({ filter_source: { workplace: "remote" }, filter_overrides: { workplace: "onsite" } })).workplace, "onsite");
  assert.equal(deriveJobFacets(job({ description: "Full-time position", filter_source: { employment: "unknown" } })).employment, "full");
});
test("location handles states, zip codes, multiple locations, county-only unknowns and source hierarchy", () => {
  assert.deepEqual(jobRegions(job({ location: "Washington, D.C., US" })), ["DC"]);
  assert.deepEqual(jobRegions(job({ location: "Pensacola, FL 32501" })), ["FL"]);
  assert.deepEqual(jobRegions(job({ location: "Fort Belvoir, Fairfax County" })), ["VA"]);
  assert.deepEqual(jobRegions(job({ location: "Fort Belvoir, Fairfax County", filter_source: { locationAreas: ["US", "Virginia", "Fairfax County"] } })), ["VA"]);
  assert.deepEqual(jobRegions(job({ location: "Berlin, Germany; Norfolk, VA" })), ["Germany", "VA"]);
  const jobs = [job(), job({ id: "2", location: null }), job({ id: "3", location: "Honolulu, HI" })];
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, regions: ["FL"] }).length, 1);
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, regions: ["FL"], includeUnknownLocation: true }).length, 2);
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, geography: "oconus" })[0].id, "3");
});
test("keyword AND, quoted phrases, exclusions, title-only and facets combine", () => {
  const jobs = [job({ description: "Instructor role. No degree required." }), job({ id: "2", description: "Instructor sales role." })];
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, keyword: "UXO instructor", excludeKeywords: "sales", selections: { education: ["none"] } }).length, 1);
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, keyword: '"UXO Technician"' }).length, 2);
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, keyword: "instructor", searchScope: "title" }).length, 0);
});
test("full-time contract roles match both employment filters; corrections win", () => {
  const listing = job({ filter_source: { employment: "full", contractType: "contract" } });
  for (const type of ["full", "contract"]) assert.equal(applyJobFilters([listing], { ...DEFAULT_JOB_FILTERS, selections: { employment: [type] } }).length, 1);
  assert.equal(applyJobFilters([{ ...listing, filter_overrides: { employment: "full" } }], { ...DEFAULT_JOB_FILTERS, selections: { employment: ["contract"] } }).length, 0);
});
test("pay range vs starting salary, unknowns, currencies, periods and estimates", () => {
  const yearly = job({ pay_min: 70000, pay_max: 110000, filter_source: { payPeriod: "year", currency: "USD", payDisclosure: "estimated" } });
  const hourly = job({ id: "2", pay_min: 45, pay_max: 50, filter_source: { payPeriod: "hour", currency: "USD" } });
  const unknown = job({ id: "3" });
  const filters = { ...DEFAULT_JOB_FILTERS, minimumPay: "100000" };
  assert.equal(applyJobFilters([yearly, hourly, unknown], filters).length, 1);
  assert.equal(applyJobFilters([yearly], { ...filters, payMatch: "starting" }).length, 0);
  assert.equal(applyJobFilters([yearly], { ...filters, advertisedPayOnly: true }).length, 0);
  assert.equal(applyJobFilters([yearly, unknown], { ...filters, includeUnknownPay: true }).length, 2);
  assert.equal(applyJobFilters([hourly], { ...filters, minimumPay: "40", payPeriod: "hour" }).length, 1);
  assert.equal(applyJobFilters([job({ ...yearly, filter_source: { payPeriod: "year", currency: "GBP" } })], filters).length, 0);
  assert.match(formatJobPay(yearly)!, /estimated/);
  assert.match(formatJobPay(job({ pay_min: 500 }))!, /period not specified/);
});
test("posting window and corrupt stored preferences", () => {
  assert.equal(applyJobFilters([job()], { ...DEFAULT_JOB_FILTERS, postedWithin: "7" }, Date.parse("2026-11-10")).length, 0);
  assert.equal(restoreJobFilters({ minimumPay: "NaN", regions: [5, "FL"], selections: { relevance: ["direct", "evil"] } }).minimumPay, "");
  assert.deepEqual(restoreJobFilters({ regions: [5, "FL"] }).regions, ["FL"]);
});
test("retired work arrangement preferences cannot hide jobs or leave active chips", () => {
  const jobs = [job({ filter_source: { workplace: "remote" } }), job({ id: "2", filter_source: { workplace: "onsite" } }), job({ id: "3" })];
  for (const workplace of ["remote", "hybrid", "onsite", "unknown"]) {
    const legacy = { ...DEFAULT_JOB_FILTERS, selections: { workplace: [workplace] } };
    assert.equal(applyJobFilters(jobs, legacy).length, 3);
    assert.deepEqual(jobFilterChips(legacy), []);
    assert.equal(restoreJobFilters(legacy).selections?.workplace, undefined);
  }
  const retained = restoreJobFilters({ ...DEFAULT_JOB_FILTERS, selections: { workplace: ["remote"], relevance: ["direct"] } });
  assert.deepEqual(retained.selections, { relevance: ["direct"] });
  assert.equal(applyJobFilters([...jobs, job({ id: "4", title: "Program Manager" })], retained).length, 3);
});
test("every state, DC and Puerto Rico stay selectable with empty inventory; PR aliases match", () => {
  const options = uniqueJobRegionOptions([]);
  assert.equal(options.length, 52);
  assert.equal(new Set(options.map(option => option.value)).size, 52);
  assert.ok(options.some(option => option.value === "DC" && option.label === "District of Columbia"));
  assert.ok(options.some(option => option.value === "PR" && option.label === "Puerto Rico"));
  assert.deepEqual(jobRegions(job({ location: "San Juan, Puerto Rico" })), ["PR"]);
  assert.deepEqual(jobRegions(job({ location: "San Juan, PR" })), ["PR"]);
  assert.deepEqual(restoreJobFilters({ regions: ["PR", "Puerto Rico", "florida"] }).regions, ["PR", "FL"]);
  const listings = [job({ location: "San Juan, PR" }), job({ id: "2", location: "Washington, DC" })];
  assert.equal(applyJobFilters(listings, { ...DEFAULT_JOB_FILTERS, regions: ["Puerto Rico"] }).length, 1);
  assert.equal(applyJobFilters(listings, { ...DEFAULT_JOB_FILTERS, geographies: ["oconus"] })[0].id, "1");
  assert.equal(applyJobFilters(listings, { ...DEFAULT_JOB_FILTERS, geographies: ["conus", "oconus"] }).length, 2);
});
test("region shortcuts preserve independent choices, combine and can be adjusted", () => {
  const groups = US_JOB_REGION_GROUPS.flatMap(group => [...group.states]);
  assert.equal(groups.length, 51); assert.equal(new Set(groups).size, 51);
  const south = US_JOB_REGION_GROUPS.find(group => group.label === "South")!;
  const northeast = US_JOB_REGION_GROUPS.find(group => group.label === "Northeast")!;
  const selected = toggleJobRegionGroup(["PR"], south.states);
  assert.ok(selected.includes("DC") && selected.includes("PR") && selected.includes("NC"));
  assert.ok(toggleJobRegionGroup(selected, northeast.states).includes("NY"));
  assert.deepEqual(toggleJobRegionGroup(selected, south.states), ["PR"]);
  assert.deepEqual(restoreJobFilters({ geography: "oconus" }).geographies, ["oconus"]);
});
test("employer aliases combine into tags and multiple employers use OR with other filters", () => {
  const listings = [job({ company_name: "CACI International Inc." }), job({ id: "2", company_name: "CACI" }), job({ id: "3", company_name: "Science Applications International Corporation" }), job({ id: "4", company_name: "MAG Aerospace, LLC", location: "Germany" }), job({ id: "5", company_name: "Other Company", description: "Works with CACI and SAIC" })];
  const options = uniqueJobEmployerOptions(listings);
  assert.equal(options.find(option => option.value === "caci")?.count, 2);
  assert.equal(options.find(option => option.value === "saic")?.count, 1);
  assert.equal(jobEmployerIdentity({ company_name: "Magazine Group" }).common, false);
  assert.ok(uniqueJobEmployerOptions([]).some(option => option.value === "mag" && option.count === 0));
  assert.equal(applyJobFilters(listings, { ...DEFAULT_JOB_FILTERS, employers: ["caci", "saic"] }).length, 3);
  assert.equal(applyJobFilters(listings, { ...DEFAULT_JOB_FILTERS, employers: ["caci", "mag"], regions: ["FL"] }).length, 2);
  const restored = restoreJobFilters({ employers: ["caci", "caci", 7, "mag"] });
  assert.deepEqual(restored.employers, ["caci", "mag"]);
  assert.equal(jobFilterChips(restored, options)[0].label, "Employer: CACI");
});
test("source enrichment retains real fields and doesn't alter USAJOBS intake summary", () => {
  const item: USAJobsApiItem = { MatchedObjectDescriptor: { PositionID: "1", PositionTitle: "Engineer", PositionURI: "https://usajobs.gov/job/1", PositionLocationDisplay: "FL", OrganizationName: "Agency", PositionRemuneration: [{ MinimumRange: "80000", MaximumRange: "110000", RateIntervalCode: "Per Year" }], PositionSchedule: [{ Name: "Full-time" }], UserArea: { Details: { JobSummary: "Summary", Education: "Degree required", Requirements: "Active Secret clearance" } } } };
  assert.equal(extractUSAJobsSummary(item), "Summary");
  assert.match(extractUSAJobsFullDescription(item), /Education\nDegree required/);
  assert.equal(usajobsFilterData(item).filter_source.payPeriod, "year");
  const source = adzunaFilterSource({ id: "1", title: "Engineer", description: "Excerpt", redirect_url: "https://adzuna.com/details/1", created: "", company: { display_name: "Acme" }, location: { display_name: "Fairfax County", area: ["US", "Virginia"] }, salary_is_predicted: 1, contract_time: "full_time" }, "us");
  assert.equal(source.payDisclosure, "estimated"); assert.equal(source.currency, "USD"); assert.deepEqual(source.locationAreas, ["US", "Virginia"]);
});
test("city/county and installation evidence resolves incomplete imported locations", () => {
  for (const [location, state] of [["Fort Belvoir, Fairfax County", "VA"], ["Fort Myer, Arlington County", "VA"], ["Crystal, Arlington County", "VA"], ["Trade, Alexandria City", "VA"], ["Tampa, Hillsborough County", "FL"], ["San Diego, San Diego County", "CA"], ["Fort Leonard Wood, Pulaski County", "MO"], ["Scott Air Force Base, Saint Clair County", "IL"], ["Wahiawa, Honolulu", "HI"], ["Fort Bragg, Cumberland County", "NC"], ["Rosemary Beach, Walton County", "FL"], ["Columbus, Franklin County", "OH"]]) {
    assert.deepEqual(jobRegions(job({ location })), [state], location);
  }
  assert.deepEqual(jobRegions(job({ location: "Honolulu, HI (On-site)" })), ["HI"]);
  assert.deepEqual(jobRegions(job({ location: "McLean, VA (On-site)" })), ["VA"]);
  assert.deepEqual(jobRegions(job({ location: "Arlington County" })), ["VA"]);
  assert.deepEqual(jobRegions(job({ location: "Orange County" })), []);
});
test("duplicate places, broad areas and foreign source markets are not guessed", () => {
  assert.deepEqual(jobRegions(job({ location: "Huntsville, Madison County" })), []);
  assert.deepEqual(jobRegions(job({ location: "Springfield" })), []);
  assert.deepEqual(jobRegions(job({ location: "International" })), []);
  assert.deepEqual(jobRegions(job({ location: "Tampa, Hillsborough County", filter_source: { country: "gb" } })), ["United Kingdom"]);
});
test("explicit title hints help but conflicting title and field locations stay flagged", () => {
  assert.deepEqual(jobRegions(job({ title: "Operational Readiness Specialist - US – VA, Fort Belvoir", location: "US" })), ["VA"]);
  assert.deepEqual(jobRegions(job({ title: "Instructor in ordnance and safety", location: null })), []);
  const conflict = resolveJobLocation(job({ title: "UXO Technician II - Radford, VA", location: "West Chester, Chester County" }));
  assert.equal(conflict.status, "conflict"); assert.deepEqual(conflict.regions, []);
  assert.deepEqual([...conflict.candidates].sort(), ["PA", "VA"]);
  assert.equal(applyJobFilters([job({ title: "Job in Aberdeen, MD", location: "Niceville, Okaloosa County" })], { ...DEFAULT_JOB_FILTERS, regions: ["FL"] }).length, 0);
});
test("board queries beyond 500 with stable ordering; feed remains limited; errors do not return partial board", async () => {
  const all = Array.from({ length: 630 }, (_, i) => ({ ...job(), id: String(i) }));
  const orders: string[] = [];
  const mock = { from() { const query = { select() { return query; }, eq() { return query; }, neq() { return query; }, gte() { return query; }, order(key: string) { orders.push(key); return query; }, async range(from: number, to: number) { return { data: all.slice(from, to + 1), error: null, count: all.length }; } }; return query; } };
  assert.equal((await fetchApprovedJobs(mock as never, 0, "cutoff")).length, 630);
  assert.equal((await fetchApprovedJobs(mock as never, 5, "cutoff")).length, 5);
  assert.ok(orders.includes("id"));
  const bad = { from() { const query = { select() { return query; }, eq() { return query; }, neq() { return query; }, gte() { return query; }, order() { return query; }, async range(from: number) { return from === 0 ? { data: all.slice(0, 250), count: 630, error: null } : { error: new Error("failed page"), data: null }; } }; return query; } };
  await assert.rejects(fetchApprovedJobs(bad as never, 0, "cutoff"), /failed page/);
});
