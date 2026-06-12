import {
  ADZUNA_COUNTRY,
  ADZUNA_RESULTS_PER_PAGE,
  ADZUNA_WHAT_EXCLUDE,
} from "./intakeConfig";

export type AdzunaApiJob = {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  description: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  created: string;
  category?: { tag?: string; label?: string };
};

export type AdzunaSearchParams = {
  what?: string;
  company?: string;
  category?: string;
  maxDaysOld?: number;
  whatExclude?: string;
  page: number;
  resultsPerPage?: number;
};

function getAdzunaCredentials(): { appId: string; appKey: string } | null {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

export async function fetchAdzunaJobs(
  params: AdzunaSearchParams
): Promise<{ jobs: AdzunaApiJob[]; error?: string }> {
  const creds = getAdzunaCredentials();
  if (!creds) {
    return { jobs: [], error: "ADZUNA_APP_ID and ADZUNA_APP_KEY are required" };
  }

  const searchParams = new URLSearchParams({
    app_id: creds.appId,
    app_key: creds.appKey,
    results_per_page: String(params.resultsPerPage ?? ADZUNA_RESULTS_PER_PAGE),
  });

  if (params.what) searchParams.set("what", params.what);
  if (params.company) searchParams.set("company", params.company);
  if (params.category) searchParams.set("category", params.category);
  if (params.maxDaysOld != null) searchParams.set("max_days_old", String(params.maxDaysOld));
  if (params.whatExclude) searchParams.set("what_exclude", params.whatExclude);

  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/${params.page}?${searchParams.toString()}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { jobs: [], error: `${res.status}: ${text.slice(0, 500)}` };
  }

  const data = await res.json();
  return { jobs: (data?.results as AdzunaApiJob[]) ?? [] };
}

export async function fetchAdzunaKeywordPage(
  what: string,
  page: number,
  maxDaysOld: number
): Promise<{ jobs: AdzunaApiJob[]; error?: string }> {
  return fetchAdzunaJobs({
    what,
    page,
    maxDaysOld,
    whatExclude: ADZUNA_WHAT_EXCLUDE,
  });
}

export async function fetchAdzunaCompanyPage(
  company: string,
  what: string | undefined,
  page: number,
  maxDaysOld: number
): Promise<{ jobs: AdzunaApiJob[]; error?: string }> {
  return fetchAdzunaJobs({
    company,
    what,
    page,
    maxDaysOld,
  });
}

export async function fetchAdzunaCategoryPage(
  category: string,
  what: string,
  page: number,
  maxDaysOld: number
): Promise<{ jobs: AdzunaApiJob[]; error?: string }> {
  return fetchAdzunaJobs({
    category,
    what,
    page,
    maxDaysOld,
    whatExclude: ADZUNA_WHAT_EXCLUDE,
  });
}

/** jobs.pay_min / pay_max are integer columns; Adzuna often returns fractional USD amounts. */
export function roundAdzunaSalary(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}
