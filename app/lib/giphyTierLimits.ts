/** GIPHY development API key hourly quota (public beta tier). */
export const GIPHY_DEV_TIER = {
  plan: "development" as const,
  callsPerHour: 100,
} as const;

export const GIPHY_WATCH_THRESHOLDS = {
  callsPerHour: Math.floor(GIPHY_DEV_TIER.callsPerHour * 0.8),
} as const;

export const GIPHY_DASHBOARD_URL = "https://developers.giphy.com/dashboard/";

export function giphyPlanFromEnv(): "development" | "production" {
  return process.env.GIPHY_PLAN === "production" ? "production" : "development";
}
