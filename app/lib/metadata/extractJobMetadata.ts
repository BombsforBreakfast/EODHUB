import { fetchSafePageHtml, parseHtmlMetadata } from "./extractMetadata";

export type ScrapedJobData = {
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  apply_url: string;
  source_site?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  og_site_name?: string;
  salary?: string;
  employment_type?: string;
  pay_min?: number | null;
  pay_max?: number | null;
};

const MAX_DESCRIPTION_LENGTH = 8000;

type JsonLdNode = Record<string, unknown>;

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength = MAX_DESCRIPTION_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = truncateText(stripHtml(value));
  return cleaned || null;
}

function asRecord(value: unknown): JsonLdNode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonLdNode;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function typeMatchesJobPosting(typeValue: unknown): boolean {
  const values = Array.isArray(typeValue) ? typeValue : [typeValue];
  return values.some((entry) => {
    const type = readString(entry)?.toLowerCase();
    return type === "jobposting" || type?.endsWith("jobposting") === true;
  });
}

function collectJsonLdNodes(node: unknown, out: JsonLdNode[]): void {
  const record = asRecord(node);
  if (!record) return;

  if (typeMatchesJobPosting(record["@type"])) {
    out.push(record);
  }

  const graph = record["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) collectJsonLdNodes(item, out);
  }
}

function extractJsonLdJobPostings(html: string): JsonLdNode[] {
  const postings: JsonLdNode[] = [];
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) collectJsonLdNodes(item, postings);
      } else {
        collectJsonLdNodes(parsed, postings);
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return postings;
}

function formatAddress(address: JsonLdNode | null): string | null {
  if (!address) return null;
  const parts = [
    readString(address.addressLocality),
    readString(address.addressRegion),
    readString(address.addressCountry),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatJobLocation(locationValue: unknown): string | null {
  const locations = Array.isArray(locationValue) ? locationValue : [locationValue];
  const parts: string[] = [];

  for (const entry of locations) {
    const record = asRecord(entry);
    if (!record) {
      const direct = readString(entry);
      if (direct) parts.push(direct);
      continue;
    }

    const address = asRecord(record.address);
    const formattedAddress = formatAddress(address);
    if (formattedAddress) {
      parts.push(formattedAddress);
      continue;
    }

    const name = readString(record.name);
    if (name) parts.push(name);
  }

  const unique = [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
  return unique.length ? unique.join(" · ") : null;
}

function readOrganizationName(value: unknown): string | null {
  const record = asRecord(value);
  if (record) return readString(record.name);
  return readString(value);
}

function readOrganizationLogo(value: unknown, pageUrl: string): string | null {
  const record = asRecord(value);
  if (!record) return null;

  const logo = record.logo;
  const logoRecord = asRecord(logo);
  const logoUrl = logoRecord ? readString(logoRecord.url) ?? readString(logoRecord.contentUrl) : readString(logo);
  if (!logoUrl) return null;

  try {
    return new URL(logoUrl, pageUrl).toString();
  } catch {
    return logoUrl;
  }
}

function formatEmploymentType(value: unknown): string | null {
  const values = Array.isArray(value) ? value : [value];
  const labels = values
    .map((entry) => readString(entry))
    .filter(Boolean)
    .map((entry) => entry!.replace(/_/g, " "));
  return labels.length ? labels.join(", ") : null;
}

function formatSalary(baseSalary: unknown): { salary: string | null; payMin: number | null; payMax: number | null } {
  const record = asRecord(baseSalary);
  if (!record) {
    const direct = readString(baseSalary);
    return { salary: direct, payMin: null, payMax: null };
  }

  const currency = readString(record.currency) ?? "USD";
  const valueRecord = asRecord(record.value);
  const minValue =
    Number(record.minValue ?? valueRecord?.minValue) ||
    Number(record.value ?? valueRecord?.value) ||
    null;
  const maxValue =
    Number(record.maxValue ?? valueRecord?.maxValue) ||
    Number(record.value ?? valueRecord?.value) ||
    null;

  const unitText = readString(record.unitText);
  const safeMin = Number.isFinite(minValue) && minValue! > 0 ? minValue! : null;
  const safeMax = Number.isFinite(maxValue) && maxValue! > 0 ? maxValue! : null;

  if (safeMin != null && safeMax != null && safeMin !== safeMax) {
    return {
      salary: `${currency} ${safeMin.toLocaleString()}–${safeMax.toLocaleString()}${unitText ? ` ${unitText}` : ""}`,
      payMin: safeMin,
      payMax: safeMax,
    };
  }

  const single = safeMax ?? safeMin;
  if (single != null) {
    return {
      salary: `${currency} ${single.toLocaleString()}${unitText ? ` ${unitText}` : ""}`,
      payMin: single,
      payMax: single,
    };
  }

  return { salary: null, payMin: null, payMax: null };
}

function inferSourceSite(safeUrl: string, siteName: string | null): string {
  if (siteName?.trim()) return siteName.trim();
  try {
    return new URL(safeUrl).hostname.replace(/^www\./i, "");
  } catch {
    return safeUrl;
  }
}

function fromJobPosting(posting: JsonLdNode, safeUrl: string): ScrapedJobData {
  const title = cleanText(posting.title);
  const description = cleanText(posting.description);
  const company = readOrganizationName(posting.hiringOrganization);
  const location = formatJobLocation(posting.jobLocation);
  const ogImage = readOrganizationLogo(posting.hiringOrganization, safeUrl);
  const employmentType = formatEmploymentType(posting.employmentType);
  const salaryInfo = formatSalary(posting.baseSalary);
  const sourceSite = company ?? inferSourceSite(safeUrl, null);

  return {
    title: title ?? undefined,
    company: company ?? undefined,
    location: location ?? undefined,
    description: description ?? undefined,
    apply_url: readString(posting.url) ?? safeUrl,
    source_site: sourceSite,
    og_title: title ?? undefined,
    og_description: description ?? undefined,
    og_image: ogImage ?? undefined,
    og_site_name: company ?? sourceSite,
    salary: salaryInfo.salary ?? undefined,
    employment_type: employmentType ?? undefined,
    pay_min: salaryInfo.payMin,
    pay_max: salaryInfo.payMax,
  };
}

function mergeDescription(base: string | undefined, employmentType?: string, salary?: string): string | undefined {
  const chunks = [base?.trim(), employmentType ? `Employment type: ${employmentType}` : null, salary ? `Salary: ${salary}` : null]
    .filter(Boolean) as string[];
  if (!chunks.length) return base;
  return truncateText(chunks.join("\n\n"));
}

export async function extractJobMetadata(websiteUrl: string): Promise<ScrapedJobData> {
  const { safeUrl, html } = await fetchSafePageHtml(websiteUrl);
  const og = parseHtmlMetadata(html, safeUrl);
  const sourceSite = inferSourceSite(safeUrl, og.siteName);

  const jobPosting = extractJsonLdJobPostings(html)[0];
  if (jobPosting) {
    const fromSchema = fromJobPosting(jobPosting, safeUrl);
    return {
      ...fromSchema,
      description: mergeDescription(fromSchema.description, fromSchema.employment_type, fromSchema.salary),
      og_description: mergeDescription(fromSchema.og_description, fromSchema.employment_type, fromSchema.salary),
      apply_url: fromSchema.apply_url || safeUrl,
    };
  }

  const ogTitle = cleanText(og.title);
  const ogDescription = cleanText(og.description);

  return {
    title: ogTitle ?? undefined,
    company: og.siteName ?? sourceSite,
    description: ogDescription ?? undefined,
    apply_url: safeUrl,
    source_site: sourceSite,
    og_title: ogTitle ?? undefined,
    og_description: ogDescription ?? undefined,
    og_image: og.image ?? undefined,
    og_site_name: og.siteName ?? sourceSite,
  };
}
