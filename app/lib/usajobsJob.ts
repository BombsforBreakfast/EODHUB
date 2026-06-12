const USAJOBS_PATH_ID = /usajobs\.gov(?::\d+)?\/job\/(\d+)/i;
const USAJOBS_VIEW_DETAILS_ID = /ViewDetails\/(\d+)/i;

/** Numeric announcement id from USAJobs apply/view URLs. */
export function parseUSAJobsPositionIdFromUrl(applyUrl: string): string | null {
  const m = applyUrl.match(USAJOBS_PATH_ID) ?? applyUrl.match(USAJOBS_VIEW_DETAILS_ID);
  return m?.[1] ?? null;
}

/** Stable apply link; avoids :443 port variants and ViewDetails paths. */
export function canonicalUSAJobsUrl(positionId: string): string {
  return `https://www.usajobs.gov/job/${positionId}`;
}

/** URL variants that may exist in legacy rows (for dedupe lookup). */
export function usajobsUrlVariants(positionId: string): string[] {
  return [
    `https://www.usajobs.gov/job/${positionId}`,
    `https://www.usajobs.gov:443/job/${positionId}`,
    `https://www.usajobs.gov/GetJob/ViewDetails/${positionId}`,
  ];
}
