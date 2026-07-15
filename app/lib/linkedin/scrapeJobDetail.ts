import type { Page } from "playwright";

export type LinkedInJobDetailExtraction = {
  description: string;
  title?: string;
  companyName?: string;
  location?: string;
};

export function cleanLinkedInJobTitle(title: string): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (normalized.length > 10 && normalized.length % 2 === 0) {
    const half = normalized.slice(0, normalized.length / 2);
    if (half === normalized.slice(normalized.length / 2)) return half;
  }
  return normalized;
}

export function linkedInDescriptionHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function scrapeLinkedInJobDetailPage(
  page: Page,
  applyUrl: string,
): Promise<LinkedInJobDetailExtraction> {
  await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1_500);

  try {
    const showMore = page
      .locator('button.show-more-less-html__button, button[aria-label*="Show more"]')
      .first();
    if (await showMore.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await showMore.click();
      await page.waitForTimeout(800);
    }
  } catch {
    // Description may already be expanded.
  }

  const detail = (await page.evaluate(
    SCRAPE_LINKEDIN_JOB_DETAIL,
  )) as LinkedInJobDetailExtraction;
  const description = detail.description.includes("<")
    ? linkedInDescriptionHtmlToPlainText(detail.description)
    : detail.description.replace(/\s+/g, " ").trim();

  if (description.length < 80) {
    console.warn(
      `Description missing or unexpectedly short for ${applyUrl} (${description.length} chars)`,
    );
  }

  return {
    ...detail,
    description: description.length >= 80 ? description : "",
    title: detail.title ? cleanLinkedInJobTitle(detail.title) : undefined,
  };
}

// Keep this as a plain string: tsx transforms function callbacks passed to
// page.evaluate(), which can inject helpers that do not exist in the browser.
export const SCRAPE_LINKEDIN_JOB_DETAIL = String.raw`(() => {
  const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

  const parseJsonLd = () => {
    const pending = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || 'null');
        pending.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } catch {
        // Try the next JSON-LD block.
      }
    }

    while (pending.length > 0) {
      const node = pending.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) pending.push(...node['@graph']);

      const type = node['@type'];
      const isJobPosting =
        type === 'JobPosting' ||
        (Array.isArray(type) && type.includes('JobPosting')) ||
        (typeof type === 'string' && type.includes('JobPosting'));
      if (!isJobPosting) continue;

      const hiringOrg = node.hiringOrganization;
      const jobLocation = Array.isArray(node.jobLocation)
        ? node.jobLocation[0]
        : node.jobLocation;
      const address = jobLocation && jobLocation.address;

      return {
        description: typeof node.description === 'string' ? node.description : '',
        title: typeof node.title === 'string' ? node.title : undefined,
        companyName:
          hiringOrg && typeof hiringOrg.name === 'string' ? hiringOrg.name : undefined,
        location:
          address && typeof address.addressLocality === 'string'
            ? address.addressLocality
            : undefined,
      };
    }
    return null;
  };

  const parseSemanticDescription = () => {
    const heading = [...document.querySelectorAll('h1, h2, h3')].find(
      (element) => cleanText(element.textContent).toLowerCase() === 'about the job',
    );
    if (!heading) return '';

    let container = heading.parentElement;
    while (
      container &&
      container !== document.body &&
      cleanText(container.innerText || container.textContent).length < 80
    ) {
      container = container.parentElement;
    }

    if (!container || container === document.body) return '';
    return cleanText(container.innerText || container.textContent)
      .replace(/^about the job\s*/i, '')
      .replace(/\s*(?:…|\.\.\.)\s*more\s*$/i, '')
      .trim();
  };

  const parseLegacyDescription = () => {
    const selectors = [
      '.show-more-less-html__markup',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '#job-details',
      '.description__text',
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = cleanText(element?.innerText || element?.textContent);
      if (text.length >= 80) return text;
    }
    return '';
  };

  const jsonLd = parseJsonLd();
  const description =
    (jsonLd && jsonLd.description) ||
    parseSemanticDescription() ||
    parseLegacyDescription();
  const semanticTitle = cleanText(document.querySelector('h1')?.textContent);
  const documentTitle = cleanText(document.title.split(' | ')[0]);
  const fallbackTitle =
    documentTitle && documentTitle.toLowerCase() !== 'linkedin'
      ? documentTitle
      : undefined;

  return {
    ...(jsonLd || {}),
    description,
    title: (jsonLd && jsonLd.title) || semanticTitle || fallbackTitle,
  };
})()`;
