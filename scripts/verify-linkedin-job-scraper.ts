import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  SCRAPE_LINKEDIN_JOB_DETAIL,
  type LinkedInJobDetailExtraction,
} from "../app/lib/linkedin/scrapeJobDetail";

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    await page.setContent(`
    <main>
      <h1>UXO Safety Officer</h1>
      <div class="randomized-a1b2">
        <div><h2>About the job</h2></div>
        <p>
          Lead unexploded ordnance safety operations, prepare daily reports,
          coordinate field teams, and enforce project safety requirements.
        </p>
        <p>
          Applicants must have relevant UXO qualifications and field experience.
        </p>
        <button>… more</button>
      </div>
    </main>
  `);

    const semantic = (await page.evaluate(
      SCRAPE_LINKEDIN_JOB_DETAIL,
    )) as LinkedInJobDetailExtraction;
    assert.equal(semantic.title, "UXO Safety Officer");
    assert.match(semantic.description, /^Lead unexploded ordnance safety operations/);
    assert.doesNotMatch(semantic.description, /About the job|… more/);
    assert.ok(semantic.description.length >= 80);

    await page.setContent(`
    <h1>Visible fallback title</h1>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [{
          "@type": "JobPosting",
          "title": "EOD Technician",
          "description": "<p>Inspect, identify, and safely dispose of explosive hazards while documenting field activities and maintaining all required safety controls.</p>",
          "hiringOrganization": { "name": "Example Employer" },
          "jobLocation": { "address": { "addressLocality": "Washington" } }
        }]
      }
    </script>
  `);

    const jsonLd = (await page.evaluate(
      SCRAPE_LINKEDIN_JOB_DETAIL,
    )) as LinkedInJobDetailExtraction;
    assert.equal(jsonLd.title, "EOD Technician");
    assert.equal(jsonLd.companyName, "Example Employer");
    assert.equal(jsonLd.location, "Washington");
    assert.match(jsonLd.description, /^<p>Inspect, identify/);

    console.log("LinkedIn job detail scraper checks passed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
