/** Conservative, shared tagging for both existing listings and future imports.
 * Missing evidence is never treated as a negative requirement. Admin overrides
 * live separately from import_metadata so a source refresh cannot erase them.
 */
export const FACET_OPTIONS = {
  relevance: { direct: "Direct EOD / UXO", related: "Related explosives / mine action", transferable: "Broader career opportunities", unknown: "Unclassified" },
  education: { none: "No college degree required", preferred: "Degree preferred", required: "Degree required", equivalent: "Experience accepted instead", unknown: "Education not specified" },
  clearance: { none: "No clearance required", secret: "Secret", ts: "Top Secret", sci: "TS/SCI", other: "Other clearance / Public Trust", unknown: "Clearance not specified" },
  clearanceStatus: { active: "Active clearance required", obtainable: "Ability to obtain", unknown: "Clearance timing not specified" },
  workplace: { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Work arrangement not specified" },
  employment: { full: "Full-time", part: "Part-time", contract: "Contract", temporary: "Temporary", unknown: "Employment type not specified" },
  payPeriod: { year: "Annual", hour: "Hourly", unknown: "Pay period not specified" },
  payDisclosure: { advertised: "Employer-advertised pay", estimated: "Estimated pay", unknown: "Pay source not confirmed" },
} as const;
export type FacetKey = keyof typeof FACET_OPTIONS;
export type JobFacets = { [K in FacetKey]: keyof (typeof FACET_OPTIONS)[K] };
export type JobFacetOverrides = Partial<JobFacets>;
export type FacetJob = {
  title?: string | null; og_title?: string | null; description?: string | null;
  og_description?: string | null; category?: string | null; location?: string | null;
  clearance?: string | null; source_type?: string | null;
  pay_min?: number | null; pay_max?: number | null;
  filter_overrides?: unknown; filter_source?: unknown;
};
export function parseFacetOverrides(value: unknown): JobFacetOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter(([key, v]) =>
    Object.hasOwn(FACET_OPTIONS, key) && typeof v === "string" && Object.hasOwn(FACET_OPTIONS[key as FacetKey], v));
  return Object.fromEntries(entries) as JobFacetOverrides;
}
export function plainJobText(value: string | null | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&apos;|&rsquo;|[’‘]/g, "'").replace(/\s+/g, " ").trim();
}
/** Render imported markup as readable text, without inserting source HTML. */
export function displayJobDescription(value: string | null | undefined): string {
  return (value ?? "").replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<li(?:\s[^>]*)?>/gi, "• ").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
export function deriveJobFacets(job: FacetJob): JobFacets {
  const title = plainJobText(job.title || job.og_title).toLowerCase();
  const text = plainJobText(job.description || job.og_description).toLowerCase();
  const source = job.filter_source && typeof job.filter_source === "object" ? job.filter_source as Record<string, unknown> : {};
  const direct = /\b(eod|uxo|explosive ordnance disposal|unexploded ordnance|bomb (?:disposal|technician)|deminer|demining technician)\b/;
  const related = /\b(explosives?|ordnance|counter[- ]?ied|c[- ]?ied|mine action|demining|cbrn|cwmd|weapons of mass destruction|munitions|weapons contamination)\b/;
  let relevance: JobFacets["relevance"] = "unknown";
  // Title evidence is strong; a generic imported EOD category alone is not.
  if (direct.test(title) && !/\b(engineer|software|sales|business development|logistics|scientist|analyst)\b/.test(title)) relevance = "direct";
  else if (direct.test(title) || related.test(title) || related.test(text)) relevance = "related";
  else if (/\b(engineer|manager|logistics|security|intelligence|analyst|technician|instructor|safety|operations|specialist)\b/.test(title)) relevance = "transferable";

  let education: JobFacets["education"] = "unknown";
  const degree = "(?:bachelor'?s?|master'?s?|college|university|associate'?s?|doctoral|ph\\.?d\\.?)";
  const sentences = text.split(/[.!?;,\n]/);
  for (const sentence of sentences) {
    if (new RegExp(`(?:no (?:${degree} )?degree (?:is )?required|degree (?:is )?not required|no education requirement)`).test(sentence)) education = "none";
    else if (/experience (?:may|can|will) (?:be )?substitut|experience in lieu of|equivalent (?:combination of )?(?:education and )?experience/.test(sentence) && /degree|education/.test(sentence)) education = "equivalent";
    else if (new RegExp(`${degree}[^;]{0,50}(?:required|must have)|(?:required|must (?:have|hold|possess))[^;]{0,50}${degree}`).test(sentence)) {
      if (education !== "equivalent") education = "required";
    } else if (new RegExp(`${degree}[^;]{0,40}(?:preferred|desired)`).test(sentence) && education === "unknown") education = "preferred";
  }
  const clearanceText = plainJobText(job.clearance || text).toLowerCase();
  let clearance: JobFacets["clearance"] = "unknown";
  if (/no (?:(?:security|secret|top secret) )?clearance (?:is )?required|clearance[: ]+(?:none|not required)/.test(clearanceText)) clearance = "none";
  else if (/ts\s*[/\-]\s*sci|top secret\s*[/\-]\s*sci/.test(clearanceText)) clearance = "sci";
  else if (/top secret|\bts clearance\b/.test(clearanceText)) clearance = "ts";
  else if (/\bsecret\b/.test(clearanceText)) clearance = "secret";
  else if (/public trust|\bq clearance\b|\bl clearance\b/.test(clearanceText)) clearance = "other";
  let clearanceStatus: JobFacets["clearanceStatus"] = "unknown";
  if (clearance !== "none" && /(?:active|current)[^.]{0,45}(?:clearance|secret|ts\/sci)|(?:must possess|must hold)[^.]{0,45}clearance/.test(clearanceText)) clearanceStatus = "active";
  else if (clearance !== "none" && /(?:ability|able|eligible)[^.]{0,30}(?:obtain|clearance)|obtain[^.]{0,35}clearance/.test(clearanceText)) clearanceStatus = "obtainable";
  const arrangement = `${plainJobText(job.location)} ${title} ${text}`.toLowerCase();
  let workplace: JobFacets["workplace"] = "unknown";
  if (/\bhybrid\b/.test(arrangement)) workplace = "hybrid";
  else if (/not (?:a )?remote|remote (?:work )?(?:is )?not|\bon[- ]?site\b/.test(arrangement)) workplace = "onsite";
  else if (/\bremote (?:work|position|role|job)|work (?:fully )?remotely|work from home|fully remote|100% remote/.test(arrangement) || /^remote\b/i.test(job.location ?? "") || /\bremote\b/.test(title)) workplace = "remote";
  let employment: JobFacets["employment"] = "unknown";
  if (/\bpart[- ]time\b/.test(text)) employment = "part";
  else if (/\bfull[- ]time\b/.test(text)) employment = "full";
  else if (/\btemporary (?:position|role|job)|employment type[: ]+temporary/.test(text)) employment = "temporary";
  else if (/\bindependent contractor|employment type[: ]+contract|contract (?:position|role)\b/.test(text)) employment = "contract";
  let payPeriod: JobFacets["payPeriod"] = "unknown";
  // Period must refer to money, not an unrelated annual leave / hourly schedule.
  if (/(?:\$[\d,.]+[^.]{0,25})(?:\/hr|\/hour|per hour|hourly)|hourly (?:pay|rate|salary)/.test(text)) payPeriod = "hour";
  else if (/(?:\$[\d,.]+[^.]{0,25})(?:\/yr|\/year|per year|per annum)|annual (?:pay|salary)|salary[^.]{0,50}per annum/.test(text)) payPeriod = "year";
  const inferred = { relevance, education, clearance, clearanceStatus, workplace, employment, payPeriod, payDisclosure: "unknown" as JobFacets["payDisclosure"] };
  const knownSource = Object.fromEntries(Object.entries(parseFacetOverrides(source)).filter(([, value]) => value !== "unknown"));
  return { ...inferred, ...knownSource, ...parseFacetOverrides(job.filter_overrides) };
}

export function formatJobPay(job: FacetJob): string | null {
  if (job.pay_min == null && job.pay_max == null) return null;
  const source = job.filter_source && typeof job.filter_source === "object" ? job.filter_source as Record<string, unknown> : {};
  const facets = deriveJobFacets(job);
  const currency = typeof source.currency === "string" ? source.currency : source.country === "us" || job.source_type !== "adzuna" ? "USD" : null;
  const amount = (v: number) => `${currency === "USD" ? "$" : currency ? `${currency} ` : ""}${v.toLocaleString()}`;
  const range = job.pay_min != null && job.pay_max != null ? job.pay_min === job.pay_max ? amount(job.pay_min) : `${amount(job.pay_min)}–${amount(job.pay_max)}` : job.pay_min != null ? `From ${amount(job.pay_min)}` : `Up to ${amount(job.pay_max!)}`;
  const period = facets.payPeriod === "year" ? "/yr" : facets.payPeriod === "hour" ? "/hr" : " · period not specified";
  const disclosure = facets.payDisclosure === "estimated" ? " · estimated" : facets.payDisclosure === "unknown" ? " · pay source unconfirmed" : "";
  return `${range}${period}${currency ? "" : " · currency not confirmed"}${disclosure}`;
}

/** A role can be both full-time and contract. Explicit corrections win. */
export function jobEmploymentTypes(job: FacetJob): string[] {
  const primary = deriveJobFacets(job).employment;
  if (parseFacetOverrides(job.filter_overrides).employment) return [primary];
  const source = job.filter_source && typeof job.filter_source === "object" ? job.filter_source as Record<string, unknown> : {};
  const text = plainJobText(job.description || job.og_description).toLowerCase();
  const result = new Set<string>([primary]);
  if (source.contractType === "contract" || /\bindependent contractor|employment type[: ]+contract|contract (?:position|role)\b/.test(text)) result.add("contract");
  if (result.size > 1) result.delete("unknown");
  return [...result];
}
