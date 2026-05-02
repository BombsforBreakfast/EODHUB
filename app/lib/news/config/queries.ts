// Query families for the GDELT discovery lane. Easy to tune.
//
// Every query is run independently against GDELT 2.0 DOC API and the union of
// results goes through the same scoring + dedupe pipeline. Prefer exact
// phrases and LE / military explosives context over single broad tokens.
//
// GDELT supports quoted phrases, OR, and parens. Keep queries tight.

export const DISCOVERY_QUERIES: string[] = [
  // Core EOD / UXO
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
  // Phrase-heavy news-style queries (prior user pass)
  '"bomb squad" news',
  '"controlled detonation" police',
  '"suspicious package" "bomb squad"',
  '"explosive ordnance disposal" military',
  '"unexploded ordnance" discovered',
  '"UXO" police',
  '"IED" "bomb squad"',
  '"pipe bomb" arrest',
  '"grenade" "bomb squad"',
  '"ordnance" evacuated',
  '"military munition" discovered',
  '"bomb technician" police',
  // Law-enforcement explosives units & incident patterns
  '"arson explosives detail"',
  '"arson/explosives detail"',
  '"explosives detail" sheriff',
  '"special enforcement bureau" explosion',
  '"bomb squad" "training facility"',
  '"deputies killed" explosion',
  '"sheriff\'s deputies" explosion',
  '"police explosives unit"',
  '"grenades found" apartment',
  '"grenade" "bomb squad"',
  '"blast" sheriff',
  '"explosion" "bomb squad"',
  '"explosion" "training facility" sheriff',
  '"controlled detonation" sheriff',
  '"explosive device" sheriff',
];

/** GDELT timespan for the discovery query (rolling window). */
export const DISCOVERY_TIMESPAN = "24h";

/** Hard cap on records pulled per query, keeps cron run latency bounded. */
export const DISCOVERY_MAX_RECORDS_PER_QUERY = 15;
