/**
 * Dry-run live ReliefWeb intake: fetch theme/source + sample keyword batches, score only (no DB writes).
 *
 *   npx tsx scripts/audit-reliefweb-live-intake.ts
 */
import fs from "fs";
import path from "path";
import {
  fetchReliefWebJobsBatch,
  fetchReliefWebJobsBySourceQuery,
  fetchReliefWebJobsByTheme,
  formatReliefWebFilterDate,
  LOOKBACK_DAYS,
  MAX_PAGES_PER_BATCH,
  normalizeReliefWebJob,
  RELIEFWEB_KEYWORD_BATCHES,
  RELIEFWEB_SOURCE_INTAKE_CHANNELS,
  RELIEFWEB_THEME_INTAKE_CHANNELS,
  RESULTS_PER_PAGE,
  scoreReliefWebJob,
  shouldIngestReliefWebJob,
  type ReliefWebApiJob,
} from "../app/lib/reliefwebJob";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const appName = process.env.RELIEFWEB_APP_NAME?.trim() ?? "";
if (!appName) {
  console.error("Missing RELIEFWEB_APP_NAME");
  process.exit(1);
}

type Scored = {
  id: string;
  title: string;
  location: string;
  countries: string[];
  organization: string;
  score: number;
  confidence: string;
  wouldImportNew: boolean;
  suppressed: boolean;
  channel: string;
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return formatReliefWebFilterDate(d);
}

async function fetchPages(
  fetcher: (
    offset: number,
  ) => Promise<{ jobs: ReliefWebApiJob[]; error?: string }>,
  maxPages: number,
): Promise<{ jobs: ReliefWebApiJob[]; errors: string[] }> {
  const jobs: ReliefWebApiJob[] = [];
  const errors: string[] = [];
  for (let page = 0; page < maxPages; page++) {
    const offset = page * RESULTS_PER_PAGE;
    const { jobs: items, error } = await fetcher(offset);
    if (error) {
      errors.push(error);
      break;
    }
    jobs.push(...items);
    if (items.length < RESULTS_PER_PAGE) break;
  }
  return { jobs, errors };
}

async function main() {
  const seen = new Map<string, Scored>();
  const channelTotals: Record<
    string,
    { fetched: number; wouldImportNew: number; suppressedNew: number; errors: string[] }
  > = {};
  const allErrors: string[] = [];

  function ensureChannel(id: string) {
    if (!channelTotals[id]) {
      channelTotals[id] = { fetched: 0, wouldImportNew: 0, suppressedNew: 0, errors: [] };
    }
    return channelTotals[id];
  }

  function scoreItems(channel: string, items: ReliefWebApiJob[]) {
    const tot = ensureChannel(channel);
    for (const raw of items) {
      const n = normalizeReliefWebJob(raw);
      if (!n) continue;
      tot.fetched += 1;
      const relevance = scoreReliefWebJob({
        title: n.title,
        description: n.description,
        metadataText: n.metadataText,
        themes: n.themes,
      });
      const passGate = !relevance.excluded &&
        shouldIngestReliefWebJob(
          relevance.score,
          n.title,
          n.description,
          n.metadataText,
        );
      // New rows that are suppressed are skipped by the importer.
      const wouldImportNew = passGate && !relevance.suppressed;
      if (wouldImportNew) tot.wouldImportNew += 1;
      if (relevance.suppressed) tot.suppressedNew += 1;

      const row: Scored = {
        id: n.reliefwebJobId,
        title: n.title.slice(0, 140),
        location: n.location.slice(0, 80),
        countries: n.countries,
        organization: n.organization.slice(0, 80),
        score: relevance.score,
        confidence: relevance.confidence,
        wouldImportNew,
        suppressed: relevance.suppressed,
        channel,
      };
      const prev = seen.get(n.reliefwebJobId);
      if (!prev || row.score > prev.score) seen.set(n.reliefwebJobId, row);
    }
  }

  for (const ch of RELIEFWEB_THEME_INTAKE_CHANNELS) {
    const since = daysAgoIso(ch.lookbackDays);
    const { jobs, errors } = await fetchPages(
      (offset) => fetchReliefWebJobsByTheme(ch.themeId, offset, appName, since),
      ch.maxPages,
    );
    const tot = ensureChannel(ch.id);
    tot.errors.push(...errors);
    allErrors.push(...errors.map((e) => `[${ch.id}] ${e}`));
    scoreItems(ch.id, jobs);
  }

  for (const ch of RELIEFWEB_SOURCE_INTAKE_CHANNELS) {
    const since = daysAgoIso(ch.lookbackDays);
    const { jobs, errors } = await fetchPages(
      (offset) => fetchReliefWebJobsBySourceQuery(ch.query, offset, appName, since),
      ch.maxPages,
    );
    const tot = ensureChannel(ch.id);
    tot.errors.push(...errors);
    allErrors.push(...errors.map((e) => `[${ch.id}] ${e}`));
    scoreItems(ch.id, jobs);
  }

  const keywordSample = RELIEFWEB_KEYWORD_BATCHES.slice(0, 3);
  const sinceKw = daysAgoIso(LOOKBACK_DAYS);
  for (const batch of keywordSample) {
    const channel = `keyword:${batch.slice(0, 40)}`;
    const { jobs, errors } = await fetchPages(
      (offset) => fetchReliefWebJobsBatch(batch, offset, appName, sinceKw),
      MAX_PAGES_PER_BATCH,
    );
    const tot = ensureChannel(channel);
    tot.errors.push(...errors);
    allErrors.push(...errors.map((e) => `[${channel}] ${e}`));
    scoreItems(channel, jobs);
  }

  const unique = [...seen.values()];
  const ingestable = unique.filter((j) => j.wouldImportNew);
  const suppressedOnly = unique.filter((j) => j.suppressed && !j.wouldImportNew);

  const countryCounts = new Map<string, number>();
  for (const j of ingestable) {
    const keys = j.countries.length ? j.countries : [j.location || "(blank)"];
    for (const c of keys) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        keywordBatchesSampled: keywordSample.length,
        keywordBatchesTotal: RELIEFWEB_KEYWORD_BATCHES.length,
        channelTotals,
        errors: allErrors.slice(0, 20),
        uniqueJobs: unique.length,
        uniqueWouldImportNew: ingestable.length,
        uniqueSuppressedOnly: suppressedOnly.length,
        topIngestableCountries: [...countryCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([country, count]) => ({ country, count })),
        sampleIngestable: ingestable
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
          .map(({ title, location, countries, organization, score, channel }) => ({
            title,
            location,
            countries,
            organization,
            score,
            channel,
          })),
        sampleSuppressed: suppressedOnly.slice(0, 10).map(({ title, location, score, channel }) => ({
          title,
          location,
          score,
          channel,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
