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
    UserArea?: {
      Details?: {
        JobSummary?: string;
      };
    };
  };
};

export type USAJobsSearchParams = {
  keyword?: string;
  positionTitle?: string;
  jobCategoryCode?: string;
  organization?: string;
  datePosted?: number;
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
    DatePosted: String(params.datePosted ?? USAJOBS_DEFAULT_DATE_POSTED),
  });

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
  datePosted: number
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
  return pos.UserArea?.Details?.JobSummary ?? pos.QualificationSummary ?? "";
}
