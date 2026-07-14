/**
 * POST a sample payload to /api/import-linkedin (no Playwright).
 *
 * Usage:
 *   npx tsx scripts/test-linkedin-import-api.ts
 *   npx tsx scripts/test-linkedin-import-api.ts http://localhost:3000
 */
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const base = process.argv[2] ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("Missing CRON_SECRET in .env.local");
  process.exit(1);
}

const sampleJob = {
  linkedinJobId: "9999999999",
  title: "EOD Technician",
  companyName: "Test Employer",
  location: "Virginia, United States",
  description: "Explosive ordnance disposal technician role for API smoke test.",
  applyUrl: "https://www.linkedin.com/jobs/view/9999999999/",
  searchQuery: "EOD",
  relevanceScore: 80,
};

async function main() {
  const res = await fetch(
    `${base}/api/import-linkedin?secret=${encodeURIComponent(secret)}`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobs: [sampleJob] }),
    },
  );
  const body = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, body }, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
