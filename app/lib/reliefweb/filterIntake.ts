/**
 * Non-keyword ReliefWeb intake channels.
 *
 * Keyword batches search title + body only. Many EOD/HMA jobs use generic titles
 * ("Field Coordinator", "Operations Manager") while the signal lives in the
 * ReliefWeb theme tag or posting organization. These channels close that gap.
 */

/** ReliefWeb theme id for "Mine Action" (T12033 on reliefweb.int). */
export const RELIEFWEB_MINE_ACTION_THEME_ID = 12033;

export type ReliefWebThemeIntakeChannel = {
  id: string;
  themeId: number;
  label: string;
  lookbackDays: number;
  maxPages: number;
};

export type ReliefWebSourceIntakeChannel = {
  id: string;
  /** Matched against ReliefWeb `source` field only — not title/body. */
  query: string;
  label: string;
  lookbackDays: number;
  maxPages: number;
};

/** All current Mine Action theme jobs, regardless of title wording. */
export const RELIEFWEB_THEME_INTAKE_CHANNELS: ReliefWebThemeIntakeChannel[] = [
  {
    id: "theme:mine-action",
    themeId: RELIEFWEB_MINE_ACTION_THEME_ID,
    label: "Mine Action",
    lookbackDays: 120,
    maxPages: 4,
  },
];

/**
 * Jobs posted by organizations that routinely advertise EOD/HMA roles with
 * non-technical titles. Source-field query avoids missing "Programme Manager"
 * style posts that never mention EOD in the headline.
 */
export const RELIEFWEB_SOURCE_INTAKE_CHANNELS: ReliefWebSourceIntakeChannel[] = [
  {
    id: "source:hma-ngos",
    query:
      'HALO OR "HALO Trust" OR "Mines Advisory Group" OR MAG OR APOPO OR FSD OR "Fondation suisse" OR UNMAS OR "Norwegian People\'s Aid" OR NPA OR GICHD OR "Danish Demining Group" OR DDG OR "Humanity & Inclusion" OR "Handicap International"',
    label: "HMA NGOs",
    lookbackDays: 90,
    maxPages: 3,
  },
];
