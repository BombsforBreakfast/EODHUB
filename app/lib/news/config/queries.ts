// Query families for the GDELT discovery lane. Easy to tune.
//
// Every query is run independently against GDELT 2.0 DOC API and the union of
// results goes through the same scoring + dedupe pipeline. Adding noise here
// is OK because the relevance scorer + negative-keyword filter cull aggressively;
// removing strong queries (e.g. '"explosive ordnance disposal"') will hurt recall.
//
// GDELT supports quoted phrases, OR, and parens. Keep queries tight.

export const DISCOVERY_QUERIES: string[] = [
  '"bomb squad"',
  '"explosive ordnance disposal"',
  '"suspicious package" police',
  '"controlled detonation"',
  '"IED" OR "UXO"',
  '"grenade found" police',
  '"render safe" explosive',
  '"bomb technician"',
  '"ATF" "explosive device"',
  '"unexploded ordnance"',
  '"pipe bomb" police',
];

/** GDELT timespan for the discovery query (rolling window). */
export const DISCOVERY_TIMESPAN = "24h";

/** Hard cap on records pulled per query, keeps cron run latency bounded. */
export const DISCOVERY_MAX_RECORDS_PER_QUERY = 15;
