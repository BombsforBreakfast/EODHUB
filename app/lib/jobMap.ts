import { isUsStateAbbr, jobRegions, JOB_LOCATION_UNSPECIFIED, regionDisplayLabel, type JobListItem } from "./jobFilters";

export type JobMapBucket = { key: string; label: string; count: number; locations: string[] };

/** Each job is counted once per location; multi-location jobs may span buckets. */
export function buildJobMap(jobs: JobListItem[]) {
  const buckets = new Map<string, JobMapBucket>();
  let us = 0, overseas = 0, unspecified = 0;
  for (const job of jobs) {
    const regions = [...new Set(jobRegions(job).filter(region => region !== "United States" && region !== "Remote"))];
    if (regions.some(isUsMapLocation)) us++;
    if (regions.some(region => !isUsMapLocation(region))) overseas++;
    if (!regions.length) { unspecified++; regions.push(JOB_LOCATION_UNSPECIFIED); }
    for (const key of regions) {
      const bucket = buckets.get(key) ?? { key, label: regionDisplayLabel(key), count: 0, locations: [] };
      bucket.count++;
      const location = job.location?.trim();
      if (location && location !== bucket.label && !bucket.locations.includes(location) && bucket.locations.length < 3) bucket.locations.push(location);
      buckets.set(key, bucket);
    }
  }
  const countries = [...buckets.values()].filter(bucket => !isUsMapLocation(bucket.key) && bucket.key !== JOB_LOCATION_UNSPECIFIED).sort((a, b) => a.label.localeCompare(b.label));
  return { buckets, countries, us, overseas, unspecified, total: jobs.length };
}

export function isUsMapLocation(key: string): boolean {
  return isUsStateAbbr(key) || key === "PR";
}

export function jobMapWorldRegion(country: string): string {
  if (["Ukraine", "Germany", "United Kingdom", "France", "Italy", "Poland", "Romania", "Belgium", "Netherlands", "Spain", "Sweden", "Norway", "Denmark", "Ireland", "Portugal"].includes(country)) return "Europe";
  if (["Kenya", "Djibouti", "Somalia", "Sudan", "South Sudan", "Libya", "Nigeria", "Mali", "South Africa", "Angola", "Ethiopia", "Mozambique", "Chad"].includes(country)) return "Africa";
  if (["Iraq", "Qatar", "Kuwait", "Saudi Arabia", "Jordan", "Yemen", "United Arab Emirates", "Lebanon", "Syria", "Israel", "Bahrain", "Oman"].includes(country)) return "Middle East";
  if (["Japan", "Australia", "New Zealand", "South Korea", "Vietnam", "Cambodia", "Laos", "Philippines", "India", "Thailand", "Taiwan", "Indonesia", "Afghanistan", "Pakistan", "Myanmar"].includes(country)) return "Asia-Pacific";
  return "Other international";
}
