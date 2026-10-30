import test from "node:test";
import assert from "node:assert/strict";
import geometry from "../app/lib/jobMapGeometry.generated.json";
import { buildJobMap } from "../app/lib/jobMap";
import { clampJobMapCamera, focusJobMapBounds, INITIAL_JOB_MAP_CAMERA, jobMapShapeBounds, jobMapTransform, layoutJobMapLabels, MAX_JOB_MAP_ZOOM, pinchJobMapCamera, zoomJobMapCamera } from "../app/lib/jobMapViewport";
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

test("populated states keep count badges at desktop and phone sizes, including all small East Coast states", () => {
  for (const size of [{ width: 960, height: 580 }, { width: 318, height: 360 }, { width: 247, height: 360 }, { width: 763, height: 265 }]) {
    const transform = jobMapTransform(size, INITIAL_JOB_MAP_CAMERA);
    const labels = layoutJobMapLabels(geometry.shapes.map(shape => ({ code: shape.code, count: 1, x: transform.x + shape.center[0] * transform.scale, y: transform.y + shape.center[1] * transform.scale })), size);
    assert.equal(labels.length, 52, JSON.stringify(size));
    for (const code of ["MD", "NJ", "MA", "RI", "CT", "DE", "NH", "VT", "DC"]) assert.ok(labels.some(label => label.code === code));
    for (const label of labels) {
      assert.ok(label.x - label.width / 2 >= 0 && label.x + label.width / 2 <= size.width);
      assert.ok(label.y - label.height / 2 >= 0 && label.y + label.height / 2 <= size.height);
      assert.ok(!(label.x + label.width / 2 > size.width - 64 && label.y + label.height / 2 > size.height - 146), `Zoom controls covered: ${label.code}`);
      for (const other of labels.filter(other => other.code !== label.code)) assert.ok(Math.abs(label.x - other.x) >= (label.width + other.width) / 2 || Math.abs(label.y - other.y) >= (label.height + other.height) / 2, `${label.code} overlaps ${other.code} at ${size.width}`);
    }
  }
});

test("zoom preserves its anchor, pinch changes zoom, and panning/reset remain bounded", () => {
  const size = { width: 960, height: 600 }, anchor = { x: 400, y: 300 };
  const next = zoomJobMapCamera(INITIAL_JOB_MAP_CAMERA, 2, size, anchor);
  const before = jobMapTransform(size, INITIAL_JOB_MAP_CAMERA), after = jobMapTransform(size, next);
  const world = { x: (anchor.x - before.x) / before.scale, y: (anchor.y - before.y) / before.scale };
  assert.equal(after.x + world.x * after.scale, anchor.x);
  assert.equal(after.y + world.y * after.scale, anchor.y);
  assert.equal(pinchJobMapCamera(INITIAL_JOB_MAP_CAMERA, [{ x: 300, y: 300 }, { x: 500, y: 300 }], [{ x: 250, y: 300 }, { x: 550, y: 300 }], size).zoom, 1.5);
  assert.equal(clampJobMapCamera({ zoom: 100, x: 1e6, y: -1e6 }, size).zoom, MAX_JOB_MAP_ZOOM);
  assert.deepEqual(zoomJobMapCamera(next, 1, size), INITIAL_JOB_MAP_CAMERA);
  const bounds = jobMapShapeBounds(geometry.shapes.filter(shape => ["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "MD"].includes(shape.code)).map(shape => shape.path));
  assert.ok(bounds.every(Number.isFinite));
  assert.ok(focusJobMapBounds(bounds, size).zoom > 1);
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
