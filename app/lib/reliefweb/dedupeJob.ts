/** Normalize ReliefWeb apply URLs for duplicate comparison. */
export function normalizeReliefWebApplyUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function normalizeJobTitleCompany(title: string, company: string): string {
  return `${title.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

export type ExistingJobRef = {
  id: string;
  reliefweb_job_id: string | null;
  apply_url: string | null;
  title: string | null;
  company_name: string | null;
  is_rejected?: boolean | null;
};

export type DuplicateMatchReason = "reliefweb_job_id" | "apply_url" | "title_company";

export function findReliefWebDuplicate(
  existing: ExistingJobRef[],
  candidate: {
    reliefwebJobId: string;
    applyUrl: string;
    title: string;
    companyName: string;
  }
): { existing: ExistingJobRef; reason: DuplicateMatchReason } | null {
  const normalizedApply = normalizeReliefWebApplyUrl(candidate.applyUrl);
  const normalizedTitleCompany = normalizeJobTitleCompany(candidate.title, candidate.companyName);

  for (const row of existing) {
    if (row.reliefweb_job_id && row.reliefweb_job_id === candidate.reliefwebJobId) {
      return { existing: row, reason: "reliefweb_job_id" };
    }
    if (row.apply_url && normalizeReliefWebApplyUrl(row.apply_url) === normalizedApply) {
      return { existing: row, reason: "apply_url" };
    }
    if (
      row.title &&
      row.company_name &&
      normalizeJobTitleCompany(row.title, row.company_name) === normalizedTitleCompany
    ) {
      return { existing: row, reason: "title_company" };
    }
  }
  return null;
}
