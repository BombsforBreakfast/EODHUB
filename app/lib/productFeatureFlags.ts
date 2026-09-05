/**
 * Parked product surfaces. Code, tables, and admin tools stay in the repo.
 * Flip a flag to true to restore that surface.
 *
 * Arcade also needs the daily cron re-added in vercel.json when revived:
 *   { "path": "/api/cron/arcade-credits-refill", "schedule": "0 0 * * *" }
 *
 * Desktop rail flags hide MasterLeftColumn / MasterRightColumn.
 * /jobs, /events, /sidebar, /businesses, and feed memorials stay live.
 */
export const PRODUCT_FEATURE_FLAGS = {
  arcadeEnabled: false,
  lemonLotEnabled: false,
  /** Floating bug-bomb FAB + account “Report a Bug” entry. Admin Bugs tab stays. */
  bugBombEnabled: false,
  /** Entire desktop left rail (MasterLeftColumn). */
  desktopLeftRailEnabled: false,
  /** Entire desktop right rail (DMs + businesses). */
  desktopRightRailEnabled: false,
  /** Jobs list + saved jobs in the desktop left rail (500-row fetch). */
  desktopRailJobsEnabled: false,
  /** Memorials on the desktop left-rail calendar (full memorials table read). */
  desktopRailMemorialsEnabled: false,
  /**
   * Feed composer judge button + per-post “take to court” trigger.
   * Existing Kangaroo Court cards / verdicts stay on posts.
   */
  kangarooCourtFeedActionsEnabled: false,
  /**
   * Per-post “Add to Rabbithole” on the feed.
   * /rabbithole tab and share-to-feed from Rabbithole stay live.
   */
  rabbitholeFeedActionsEnabled: false,
} as const;
