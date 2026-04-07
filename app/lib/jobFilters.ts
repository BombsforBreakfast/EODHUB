export type JobListItem = {
  id: string;
  created_at: string | null;
  title: string | null;
  category: string | null;
  location: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  description: string | null;
  apply_url: string | null;
  company_name: string | null;
  source_type: string | null;
  user_id?: string | null;
  anonymous?: boolean | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

export type JobFilterState = {
  location: string;
  keyword: string;
  minSalary: string;
};

function toLower(v: string | null | undefined): string {
  return (v ?? "").toLowerCase();
}

export function applyJobFilters(jobs: JobListItem[], filters: JobFilterState): JobListItem[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const location = filters.location.trim().toLowerCase();
  const minSalaryNum = Number.parseInt(filters.minSalary, 10);
  const useMinSalary = Number.isFinite(minSalaryNum) && minSalaryNum > 0;

  return jobs.filter((job) => {
    if (location && !toLower(job.location).includes(location)) return false;

    if (keyword) {
      const haystack = [
        job.title,
        job.category,
        job.description,
        job.company_name,
        job.clearance,
        job.og_title,
        job.og_description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    if (useMinSalary) {
      const maxPay = job.pay_max ?? job.pay_min ?? null;
      if (maxPay === null || maxPay < minSalaryNum) return false;
    }

    return true;
  });
}

export function uniqueJobLocations(jobs: JobListItem[]): string[] {
  return [...new Set(jobs.map((j) => (j.location ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
