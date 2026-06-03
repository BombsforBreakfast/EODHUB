import {
  ONBOARDING_FUNNEL_STEPS,
  ONBOARDING_STEP_LABELS,
} from "./onboardingAnalytics";

export function isOnboardingEventsTableMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    msg.includes("onboarding_events") ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

export function emptyOnboardingFunnelResponse(
  range: "7d" | "30d" | "90d",
  note: string,
  incompleteProfiles = 0,
) {
  return {
    range,
    generated_at: new Date().toISOString(),
    cohort_signups: 0,
    incomplete_profiles_no_events: incompleteProfiles,
    funnel: ONBOARDING_FUNNEL_STEPS.map((step) => ({
      step,
      label: ONBOARDING_STEP_LABELS[step],
      users: 0,
      conversion_from_previous_pct: null,
      conversion_from_start_pct: null,
    })),
    drop_offs: [] as Array<{ step: string; label: string; users: number }>,
    note,
  };
}
