import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type OnboardingEventKind,
  type OnboardingFunnelStep,
} from "./onboardingAnalytics";

/** Insert onboarding funnel event (service_role). Never throws. */
export async function insertOnboardingEvent(
  admin: SupabaseClient,
  userId: string,
  step: OnboardingFunnelStep,
  event: OnboardingEventKind = "success",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await admin.from("onboarding_events").insert({
      user_id: userId,
      step,
      event,
      metadata,
    });
  } catch {
    // analytics must never block auth or onboarding
  }
}
