// Keyword and domain config for the relevance scorer. All matching is
// case-insensitive against lowercased text. Tune freely.

/** Strong EOD signals — high score when found in the headline. */
export const POSITIVE_TITLE: string[] = [
  "bomb squad",
  "bomb squad callout",
  "bomb squad called",
  "bomb technician",
  "bomb tech",
  "explosive ordnance disposal",
  "eod technician",
  "eod team",
  "eod unit",
  "unexploded ordnance",
  "uxo",
  "ied",
  "improvised explosive",
  "render safe",
  "controlled detonation",
  "controlled blast",
  "suspicious package",
  "suspicious device",
  "bomb threat",
  "threat causes evacuation",
  "evacuated after bomb threat",
  "pipe bomb",
  "grenade found",
  "grenade",
  "grenades",
  "wwii bomb",
  "world war ii bomb",
  "wartime bomb",
  "historic bomb",
  "explosive device",
  "ordnance disposal",
  "demining",
  "atf explosives",
  // Law-enforcement / public-safety explosives incidents (headline recall)
  "explosion kills",
  "killed in explosion",
  "fatal explosion",
  "deputies killed",
  "lasd",
  "arson explosives",
  "arson/explosives",
  "explosives detail",
  "special enforcement bureau",
  "police explosives unit",
  "military explosive",
  "ammunition disposal",
  "hazmat and explosives",
];

/** Same keywords, lower weight when found only in summary/snippet. */
export const POSITIVE_BODY: string[] = [
  ...POSITIVE_TITLE,
  "explosives unit",
  "hazardous device",
  "bomb scare",
  "magnet fishing",
  "evacuation ordered",
  "evacuation lifted",
  "rendered safe",
  "disposal operation",
  "ordnance discovered",
  "unexploded bomb",
  "ordnance",
  "munitions",
  "post-blast",
  "robot deployed",
  "live grenade",
  "hand grenade",
  "training facility",
  "explosives bureau",
  "explosives section",
  "arson and explosives",
];

/**
 * Extra relevance for sheriff / LE explosives-unit vocabulary (counts in
 * addition to POSITIVE_* tallies; capped in scoring).
 */
export const LE_EXPLOSIVES_BOOST: string[] = [
  "arson/explosives",
  "arson explosives",
  "explosives detail",
  "special enforcement bureau",
  "lasd",
  "police explosives unit",
  "bomb squad",
  "grenade",
  "grenades",
  "training facility",
  "deputies killed",
  "sheriff's deputies",
  "explosive device",
  "controlled detonation",
  "render safe",
  "post-blast",
];

/** Context words that boost military / law-enforcement framing. */
export const LE_MIL_CONTEXT: string[] = [
  "police",
  "sheriff",
  "deputy",
  "deputies",
  "trooper",
  "fbi",
  "atf",
  "swat",
  "marines",
  "army",
  "navy",
  "air force",
  "soldier",
  "veteran",
  "military",
  "department",
  "task force",
];

/**
 * Phrases that strongly suggest a metaphorical / off-topic use of EOD vocab.
 * Hard penalty on title match, softer penalty on summary-only match.
 */
export const NEGATIVE_PHRASES: string[] = [
  // metaphors
  "bombshell",
  "explosive growth",
  "explosive scenes",
  "explosive performance",
  "explosive interview",
  "explosive episode",
  "explosive new book",
  "drops bombshell",
  "ied of",
  // sports
  "touchdown",
  "quarterback",
  "playoff",
  "world series",
  "nba",
  "nfl",
  "mlb",
  "ufc",
  "wwe",
  // entertainment / business metaphors
  "box office",
  "trailer drops",
  "stock surges",
  "stock plunges",
  "ipo",
  "earnings",
  // unrelated acronym collisions
  "improvised electronic device",
  "ied team building",
  "bomb cyclone",
  "box office bomb",
  "blew up online",
  "sports bomb",
  "fantasy football",
  "bomb recipe",
];

/** Domains permitted in the satire lane. Items from these sources get the satire badge. */
export const SATIRE_DOMAINS: string[] = [
  "duffelblog.com",
  "www.duffelblog.com",
];

/** Score thresholds — items below these are dropped before insert. */
// Slightly lower the non-satire floor so a single strong title signal from a
// local/newswire source (e.g. "bomb threat", "controlled blast", "WWII bomb")
// can clear without requiring multiple phrase matches.
export const MIN_SCORE = 8;
export const MIN_SCORE_SATIRE = 6;

/** Scoring constants (kept here so all tunables live in one file). */
export const SCORE = {
  perTitleHit: 6,
  maxTitleBonus: 12,
  perBodyHit: 2,
  maxBodyBonus: 6,
  // Lowered from 3 → 1: LE/military framing is too common (any base story
  // mentions "navy"/"military"/"department"). It's a tiebreaker, not a signal.
  contextBonus: 1,
  /** Per matched LE_EXPLOSIVES_BOOST needle (title+body combined). */
  leBoostPerHit: 2,
  leBoostMax: 10,
  freshnessUnder6h: 4,
  freshnessUnder24h: 2,
  freshnessOver72hPenalty: -5,
  negativeTitlePenalty: -20,
  negativeBodyPenalty: -10,
};
