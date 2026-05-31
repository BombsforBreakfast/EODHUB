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

const routes = ["import-usajobs", "import-adzuna", "import-reliefweb"] as const;

type Result = {
  route: string;
  ok: boolean;
  status: number;
  durationMs: number;
  summary: Record<string, unknown>;
  error?: string;
};

async function testRoute(route: (typeof routes)[number]): Promise<Result> {
  const started = Date.now();
  const url = `${base}/api/${route}?secret=${encodeURIComponent(secret!)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const durationMs = Date.now() - started;
    const ok =
      res.ok &&
      body.error == null &&
      body.skippedRun !== true;

    const summary: Record<string, unknown> = {
      imported: body.imported ?? null,
      refreshed: body.refreshed ?? null,
      skipped: body.skipped ?? null,
      purged: body.purged ?? null,
      suppressed: body.suppressed ?? null,
      apiCalls: body.apiCalls ?? null,
      sample: body.sample ?? null,
      errors: body.errors ?? null,
      reason: body.reason ?? null,
    };

    return { route, ok, status: res.status, durationMs, summary, error: body.error as string | undefined };
  } catch (e) {
    return {
      route,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      summary: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const results: Result[] = [];
  for (const route of routes) {
    console.log(`Testing ${route}...`);
    results.push(await testRoute(route));
  }

  console.log(JSON.stringify({ base, results }, null, 2));

  const failed = results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
