/**
 * ReliefWeb-only relevance tuning.
 *
 * Humanitarian job descriptions use inconsistent language, so ReliefWeb intake stays
 * broad at the API layer and relevance is decided here in a second pass.
 */

export const FIELD_WEIGHT_CAPS = {
  title: 60,
  metadata: 25,
  body: 15,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  high: 75,
  possible: 50,
} as const;

/** Hard block — never import regardless of score. */
export const HARD_EXCLUSION_TERMS = [
  "mixed migration",
  "human trafficking",
  "trafficking in persons",
  "anti-trafficking",
];

/** Strong EOD/HMA/UXO signals. */
export const STRONG_POSITIVE_KEYWORDS = [
  "eod",
  "uxo",
  "iedd",
  "hma",
  "humanitarian mine action",
  "mine action",
  "demining",
  "deminer",
  "explosive ordnance",
  "explosive ordnance disposal",
  "battle area clearance",
  "bac",
  "explosive hazards",
  "explosive hazard",
  "explosive remnants of war",
  "erw",
  "unexploded ordnance",
  "ammunition management",
  "weapons contamination",
  "weapons intelligence",
  "cbrn",
  "cbrne",
  "wmd",
  "counter wmd",
  "cwmd",
  "render safe",
  "rsp",
  "improvised explosive",
  "improvised explosive device",
  "ied",
  "mine clearance",
  "explosive clearance",
  "eore",
  "explosive ordnance risk education",
];

/** Adjacent roles that often sit next to EOD/HMA teams. */
export const MEDIUM_POSITIVE_KEYWORDS = [
  "standards and training",
  "training manager",
  "technical advisor",
  "operations advisor",
  "field coordinator",
  "security advisor",
  "risk education",
  "explosive safety",
  "ordnance",
  "clearance",
  "disposal",
  "weapons",
  "ammunition",
  "munitions",
  "hazardous areas",
  "technical survey",
  "non-technical survey",
  "quality assurance",
  "quality control",
  "land release",
  "unmanned aerial",
  "unmanned aerial system",
  "uas",
  "uav",
  "drone mapping",
];

/** Downrank generic humanitarian roles — do not hard-block if title has strong EOD/HMA terms. */
export const NEGATIVE_KEYWORDS = [
  "nutrition",
  "food security",
  "gender",
  "gender equality",
  "child protection",
  "education",
  "public health",
  "health",
  "wash",
  "water sanitation",
  "livelihoods",
  "cash assistance",
  "migration",
  "refugee protection",
  "human rights",
  "agriculture",
  "shelter",
  "logistics",
  "finance officer",
  "hr officer",
  "communications officer",
  "grants officer",
  "fundraising",
  "individual giving",
  "digital fundraising",
  "wildlife",
  "clinical",
  "farm",
  "farming",
  "medical",
];

export const MATCH_POINTS = {
  strong: { title: 22, metadata: 14, body: 9 },
  medium: { title: 10, metadata: 6, body: 4 },
  negative: { title: 16, metadata: 9, body: 5 },
} as const;

/** Broad ReliefWeb API keyword batches — first-stage intake only. */
export const RELIEFWEB_KEYWORD_BATCHES: string[] = [
  "explosive OR ordnance OR EOD OR UXO OR \"unexploded ordnance\"",
  "\"mine action\" OR \"humanitarian mine action\" OR HMA OR demining OR deminer",
  "clearance OR \"weapons contamination\" OR \"explosive ordnance risk education\" OR EORE OR \"risk education\"",
  "IED OR \"improvised explosive\" OR IEDD OR CBRN OR CBRNE OR WMD OR CWMD OR \"counter weapons of mass destruction\"",
  "ammunition OR munitions OR \"small arms\" OR \"light weapons\" OR SALW OR \"explosive hazard\" OR \"explosive hazards\"",
  "\"standards and training\" OR \"training manager\" OR \"technical advisor\" OR \"operations manager\" OR \"field coordinator\"",
  "\"quality assurance\" OR \"quality control\" OR \"land release\" OR \"battle area clearance\" OR BAC OR \"technical survey\" OR NTS",
  "\"non-technical survey\" OR \"explosive remnants of war\" OR ERW OR \"render safe\" OR RSP",
  "\"unmanned aerial\" OR UAS OR UAV OR \"drone mapping\" OR \"aerial survey\"",
  "protection OR \"security advisor\" OR \"safety and security\" OR stabilization OR peacebuilding OR conflict",
  "Syria OR Iraq OR Ukraine OR Afghanistan OR Somalia OR Yemen OR Gaza OR Sudan OR Libya OR Myanmar",
  "HALO OR \"Mines Advisory Group\" OR UNMAS OR NPA OR FSD OR GICHD OR \"Danish Demining Group\" OR APOPO",
];

export type ReliefWebConfidence = "high" | "possible" | "low";

export type ReliefWebFieldLabel = "title" | "metadata" | "body";
