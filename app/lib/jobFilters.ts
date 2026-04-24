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

export type SalaryMin = 25000 | 50000 | 75000 | 100000 | 125000 | 150000;
export type LocationRadius = 25 | 50 | 100;

export type JobFilterState = {
  location: string;
  keyword: string;
  salaryMin: SalaryMin | "";
  locationZip: string;
  locationRadius: LocationRadius | "";
};

function toLower(v: string | null | undefined): string {
  return (v ?? "").toLowerCase();
}

export function applyJobFilters(jobs: JobListItem[], filters: JobFilterState): JobListItem[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const location = filters.location.trim().toLowerCase();
  const salaryMin = filters.salaryMin;

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

    if (salaryMin !== "") {
      // Show job if either end of the salary range reaches the minimum threshold
      const qualifies =
        (job.pay_max !== null && job.pay_max >= salaryMin) ||
        (job.pay_min !== null && job.pay_min >= salaryMin);
      if (!qualifies) return false;
    }

    return true;
  });
}

export function uniqueJobLocations(jobs: JobListItem[]): string[] {
  return [...new Set(jobs.map((j) => (j.location ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
