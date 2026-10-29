import { USAJOBS_DEFAULT_DATE_POSTED, USAJOBS_RESULTS_PER_PAGE } from "./intakeConfig";

export type USAJobsApiItem = {
  /** Numeric control number used in usajobs.gov/job/<id> links. */
  MatchedObjectId?: string;
  MatchedObjectDescriptor: {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay: string;
    OrganizationName: string;
    DepartmentName?: string;
    QualificationSummary?: string;
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string; Description?: string }[];
    PositionSchedule?: { Name?: string; Code?: string }[];
    PositionLocation?: { LocationName?: string; CountryCode?: string; CountrySubDivisionCode?: string }[];
    UserArea?: {
      Details?: {
        JobSummary?: string;
        MajorDuties?: string | string[];
        Education?: string;
        Requirements?: string;
        Evaluations?: string;
        HowToApply?: string;
        OtherInformation?: string;
        SecurityClearance?: string;
      };
    };
  };
};

export type USAJobsSearchParams = {
  keyword?: string;
  positionTitle?: string;
  jobCategoryCode?: string;
  organization?: string;
  /** null searches all currently open announcements, regardless of posting age. */
  datePosted?: number | null;
  page: number;
  resultsPerPage?: number;
};

function getUSAJobsCredentials(): { apiKey: string; email: string } | null {
  const apiKey = process.env.USAJOBS_API_KEY?.trim();
  const email = process.env.USAJOBS_EMAIL?.trim();
  if (!apiKey || !email) return null;
  return { apiKey, email };
}

export async function fetchUSAJobsSearch(
  params: USAJobsSearchParams
): Promise<{ items: USAJobsApiItem[]; error?: string }> {
  const creds = getUSAJobsCredentials();
  if (!creds) {
    return { items: [], error: "USAJOBS_API_KEY and USAJOBS_EMAIL are required" };
  }

  const searchParams = new URLSearchParams({
    ResultsPerPage: String(params.resultsPerPage ?? USAJOBS_RESULTS_PER_PAGE),
    Page: String(params.page),
    Fields: "Full",
  });

  if (params.datePosted !== null) {
    searchParams.set("DatePosted", String(params.datePosted ?? USAJOBS_DEFAULT_DATE_POSTED));
  }

  if (params.keyword) searchParams.set("Keyword", params.keyword);
  if (params.positionTitle) searchParams.set("PositionTitle", params.positionTitle);
  if (params.jobCategoryCode) searchParams.set("JobCategoryCode", params.jobCategoryCode);
  if (params.organization) searchParams.set("Organization", params.organization);

  const res = await fetch(`https://data.usajobs.gov/api/Search?${searchParams.toString()}`, {
    headers: {
      "Authorization-Key": creds.apiKey,
      "User-Agent": creds.email,
      Host: "data.usajobs.gov",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { items: [], error: `${res.status}: ${text.slice(0, 500)}` };
  }

  const data = await res.json();
  return {
    items: (data?.SearchResult?.SearchResultItems as USAJobsApiItem[]) ?? [],
  };
}

export async function fetchUSAJobsKeywordPage(
  keyword: string,
  page: number,
  datePosted: number | null
): Promise<{ items: USAJobsApiItem[]; error?: string }> {
  return fetchUSAJobsSearch({ keyword, page, datePosted });
}

export async function fetchUSAJobsSeriesPage(
  jobCategoryCode: string,
  keyword: string | undefined,
  page: number,
  datePosted: number
): Promise<{ items: USAJobsApiItem[]; error?: string }> {
  return fetchUSAJobsSearch({ jobCategoryCode, keyword, page, datePosted });
}

export async function fetchUSAJobsOrganizationPage(
  organization: string,
  keyword: string | undefined,
  page: number,
  datePosted: number
): Promise<{ items: USAJobsApiItem[]; error?: string }> {
  return fetchUSAJobsSearch({ organization, keyword, page, datePosted });
}

export async function fetchUSAJobsTitlePage(
  positionTitle: string,
  page: number,
  datePosted: number
): Promise<{ items: USAJobsApiItem[]; error?: string }> {
  return fetchUSAJobsSearch({ positionTitle, page, datePosted });
}

export function extractUSAJobsSummary(item: USAJobsApiItem): string {
  const pos = item.MatchedObjectDescriptor;
  const details = pos.UserArea?.Details;
  const duties = details?.MajorDuties;
  // A generic title or summary can hide the role's actual specialty in the
  // qualifications/duties. Preserve both instead of picking only one field.
  return [...new Set([
    details?.JobSummary,
    pos.QualificationSummary,
    ...(Array.isArray(duties) ? duties : [duties]),
  ].filter((text): text is string => typeof text === "string" && Boolean(text.trim())))].join("\n\n");
}

/** Keep the intake scorer's established summary stable; enrich cards separately. */
export function extractUSAJobsFullDescription(item: USAJobsApiItem): string {
  const details = item.MatchedObjectDescriptor.UserArea?.Details;
  const sections = [extractUSAJobsSummary(item)];
  for (const key of ["Education", "Requirements", "Evaluations", "HowToApply", "OtherInformation"] as const) {
    const value = details?.[key]?.trim();
    if (value) sections.push(`${key.replace(/([a-z])([A-Z])/g, "$1 $2")}\n${value}`);
  }
  return sections.join("\n\n");
}

export function usajobsFilterData(item: USAJobsApiItem) {
  const position = item.MatchedObjectDescriptor;
  const salary = position.PositionRemuneration?.[0];
  const period = `${salary?.RateIntervalCode ?? ""} ${salary?.Description ?? ""}`.toLowerCase();
  const payPeriod = /per year|annual|\bpa\b/.test(period) ? "year" : /per hour|hourly|\bph\b/.test(period) ? "hour" : "unknown";
  const amount = (v?: string) => v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null;
  const schedules = position.PositionSchedule?.map(s => s.Name ?? "").join(" ").toLowerCase() ?? "";
  const locations = position.PositionLocation ?? [];
  return {
    pay_min: amount(salary?.MinimumRange), pay_max: amount(salary?.MaximumRange),
    clearance: position.UserArea?.Details?.SecurityClearance ?? null,
    filter_source: {
      currency: "USD", payPeriod, payDisclosure: salary ? "advertised" : "unknown",
      employment: /full[- ]time/.test(schedules) ? "full" : /part[- ]time/.test(schedules) ? "part" : "unknown",
      locationAreas: locations.flatMap(l => [l.CountrySubDivisionCode, l.LocationName].filter((s): s is string => !!s)),
      descriptionIsExcerpt: false,
    },
  };
}
