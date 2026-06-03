/**
 * Onboarding funnel steps — ordered for admin funnel display.
 * Each step should fire at least once per user when they reach that stage.
 */
export const ONBOARDING_FUNNEL_STEPS = [
  "signup_complete",
  "onboarding_viewed",
  "onboarding_account_type",
  "onboarding_submit",
  "onboarding_saved",
  "subscription_ack_viewed",
  "subscription_ack_done",
  "verify_email_viewed",
  "email_verified",
  "pending_viewed",
  "admin_verified",
] as const;

export type OnboardingFunnelStep = (typeof ONBOARDING_FUNNEL_STEPS)[number];

export type OnboardingEventKind = "view" | "action" | "success" | "error";

export const ONBOARDING_STEP_LABELS: Record<OnboardingFunnelStep, string> = {
  signup_complete: "Account created",
  onboarding_viewed: "Opened onboarding",
  onboarding_account_type: "Chose member / employer",
  onboarding_submit: "Submitted onboarding form",
  onboarding_saved: "Profile saved",
  subscription_ack_viewed: "Saw subscription terms",
  subscription_ack_done: "Accepted subscription terms",
  verify_email_viewed: "Saw verify-email page",
  email_verified: "Email verified",
  pending_viewed: "Awaiting approval (pending)",
  admin_verified: "Admin verified",
};

/** Fire-and-forget client event — never throws. */
export function trackOnboardingStep(
  step: OnboardingFunnelStep,
  event: OnboardingEventKind = "view",
  metadata?: Record<string, unknown>,
): void {
  try {
    void (async () => {
      const { supabase } = await import("./lib/supabaseClient");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      await fetch("/api/analytics/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
        body: JSON.stringify({ step, event, metadata: metadata ?? {} }),
      });
    })();
  } catch {
    // analytics must never break signup
  }
}
