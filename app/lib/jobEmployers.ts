export type EmployerJob = { company_name?: string | null };
export type JobEmployerOption = { value: string; label: string; count: number };

/** Group spelling/corporate-suffix variants, without searching descriptions or
 * inferring affiliations between different businesses. */
const COMMON_EMPLOYERS = [
  { value: "caci", label: "CACI", pattern: /^caci(?: international)?$/ },
  { value: "saic", label: "SAIC", pattern: /^(?:saic|science applications international)$/ },
  { value: "mag", label: "MAG Aerospace", pattern: /^mag(?: aerospace| ds)?$/ },
  { value: "amentum", label: "Amentum", pattern: /^amentum$/ },
  { value: "leidos", label: "Leidos", pattern: /^leidos$/ },
  { value: "parsons", label: "Parsons", pattern: /^parsons$/ },
  { value: "booz-allen", label: "Booz Allen Hamilton", pattern: /^booz allen(?: hamilton)?$/ },
  { value: "jacobs", label: "Jacobs", pattern: /^jacobs(?: engineering group)?$/ },
  { value: "weston", label: "Weston Solutions", pattern: /^weston solutions$/ },
  { value: "summit-et", label: "Summit ET", pattern: /^summit et$/ },
  { value: "tetra-tech", label: "Tetra Tech", pattern: /^tetra tech$/ },
] as const;

export function normalizeEmployerName(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .replace(/(?:\s+(?:incorporated|inc|corporation|corp|llc|ltd|limited|plc))+$/, "");
}

export function jobEmployerIdentity(job: EmployerJob): { value: string; label: string; common: boolean } {
  const label = job.company_name?.trim() ?? "";
  const normalized = normalizeEmployerName(label);
  if (!normalized || normalized === "unknown company") return { value: "unknown", label: "Employer not specified", common: false };
  const common = COMMON_EMPLOYERS.find(option => option.pattern.test(normalized));
  return common ? { value: common.value, label: common.label, common: true } : { value: `name:${normalized}`, label, common: false };
}

export function uniqueJobEmployerOptions(jobs: EmployerJob[]): JobEmployerOption[] {
  const common = COMMON_EMPLOYERS.map(({ value, label }) => ({ value, label, count: 0 }));
  const options = new Map<string, JobEmployerOption>(common.map(option => [option.value, option]));
  for (const job of jobs) {
    const identity = jobEmployerIdentity(job);
    const existing = options.get(identity.value);
    if (existing) existing.count++;
    else options.set(identity.value, { value: identity.value, label: identity.label, count: 1 });
  }
  const other = [...options.values()].filter(option => !COMMON_EMPLOYERS.some(common => common.value === option.value));
  return [...common, ...other.sort((a, b) => a.label.localeCompare(b.label))];
}

export function employerFilterLabel(value: string, options: JobEmployerOption[] = []): string {
  return options.find(option => option.value === value)?.label ?? COMMON_EMPLOYERS.find(option => option.value === value)?.label ?? (value === "unknown" ? "Employer not specified" : value.replace(/^name:/, ""));
}
