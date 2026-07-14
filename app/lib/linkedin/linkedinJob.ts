export function parseLinkedInJobIdFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const match = url.match(/\/jobs\/view\/(\d+)/i);
  return match?.[1] ?? null;
}

export function canonicalLinkedInJobUrl(jobId: string): string {
  return `https://www.linkedin.com/jobs/view/${jobId}/`;
}

export function linkedInSearchUrl(keywords: string, location: string): string {
  const params = new URLSearchParams({
    keywords,
    location,
    /** Past week — keeps daily runs focused on fresh listings. */
    f_TPR: "r604800",
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}
