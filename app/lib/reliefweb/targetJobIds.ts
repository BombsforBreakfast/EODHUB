/**
 * ReliefWeb job IDs from focused EOD / HMA / CIED / UAS searches.
 * Fetched by ID on each import so listings are not missed by keyword/date filters.
 * @see scripts/crossref-reliefweb-targeted.ts
 */
export const TARGET_RELIEFWEB_JOB_IDS: string[] = [
  // HMA / EOD — management & operations
  "4211588", // DRC — Humanitarian Mine Action Program Manager, Lebanon
  "4209488", // DRC — Operations Manager HMA, Ethiopia
  "4202592", // UNOPS/CTG — Mine Action Operations Specialist, South Sudan
  "4201190", // NPA — Deputy Programme Manager, Ukraine
  "4201712", // MAG — Global Technical Director
  // HMA / EOD — field technical
  "4213821", // MAG — Technical Field Manager, Cambodia
  "4208146", // HI — Land Release Technical Field Manager, Middle East (IEDD)
  "4198515", // MAG — Technical Lead WAM, Syria
  "4201720", // MAG — WAM Technical Field Manager, Jordan
  "4197717", // HI — Area Manager Raqqah, Syria
  // Ukraine / survey assets
  "4196303", // APOPO — Mine Detection Dogs / TSD talent pool, Ukraine
  // UAS / aerial (adjacent)
  "4199340", // SOS Méditerranée — Head of Mission, aerial monitoring, Italy
  "4213404", // Shaqodoon — GIS / drone mapping consultant, Somalia
  // Mine action expansion
  "4205891", // HI — Armed Violence Reduction Specialist, Sudan
];
