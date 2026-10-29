import test from "node:test";
import assert from "node:assert/strict";
import geometry from "../app/lib/jobMapGeometry.generated.json";
import { buildJobMap } from "../app/lib/jobMap";
import { applyJobFilters, DEFAULT_JOB_FILTERS, JOB_LOCATION_UNSPECIFIED, jobFilterChips, restoreJobFilters, type JobListItem } from "../app/lib/jobFilters";

function job(id: string, location: string | null, title = "EOD Technician"): JobListItem {
  return { id, location, title, created_at: null, company_name: "Employer", description: null, category: null, clearance: null, pay_min: null, pay_max: null, source_type: null, apply_url: null, og_title: null, og_description: null, og_image: null, og_site_name: null };
}

test("geometry covers every state, DC and PR with projected paths and finite centers", () => {
  assert.equal(geometry.shapes.length, 52);
  assert.equal(new Set(geometry.shapes.map(shape => shape.code)).size, 52);
  for (const code of ["AK", "HI", "PR", "DC"]) assert.ok(geometry.shapes.some(shape => shape.code === code));
  assert.ok(geometry.shapes.every(shape => shape.path.startsWith("M") && shape.center.length === 2 && shape.center.every(Number.isFinite)));
});

test("map counts use the same inferred states, foreign countries and unresolved conflicts as list filtering", () => {
  const jobs = [job("va", "Fort Belvoir, Fairfax County"), job("fl", "Tampa, Hillsborough County"), job("multi", "Norfolk, VA; Berlin, Germany"), job("broad", "US"), job("missing", null), job("conflict", "Niceville, Okaloosa County", "Technician in Aberdeen, MD")];
  const map = buildJobMap(jobs);
  assert.equal(map.total, 6); assert.equal(map.us, 3); assert.equal(map.overseas, 1); assert.equal(map.unspecified, 3);
  assert.equal(map.buckets.get("VA")?.count, 2); assert.equal(map.buckets.get("Germany")?.count, 1);
  assert.deepEqual(map.countries.map(country => country.key), ["Germany"]);
  assert.deepEqual(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, regions: ["VA", "Germany"] }).map(j => j.id), ["va", "multi"]);
  assert.deepEqual(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, regions: [JOB_LOCATION_UNSPECIFIED] }).map(j => j.id), ["broad", "missing", "conflict"]);
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, regions: ["VA", JOB_LOCATION_UNSPECIFIED] }).length, 5);
  assert.equal(applyJobFilters(jobs, { ...DEFAULT_JOB_FILTERS, regions: [JOB_LOCATION_UNSPECIFIED], geographies: ["conus"] }).length, 0);
  assert.equal(jobFilterChips(restoreJobFilters({ regions: [JOB_LOCATION_UNSPECIFIED] }))[0].label, "Lacks location detail");
});
