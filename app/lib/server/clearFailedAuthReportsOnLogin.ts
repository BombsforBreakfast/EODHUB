import type { SupabaseClient } from "@supabase/supabase-js";
import { devAuthLog } from "@/app/lib/auth/signupErrors";

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
}

/**
 * Remove unresolved failed-auth triage entries once the user signs in
 * successfully. Only deletes rows with no admin_decision so resolved /
 * provisioned reports stay in the audit trail.
 */
export async function clearFailedAuthReportsOnSuccessfulLogin(
  adminClient: SupabaseClient,
  email: string | null | undefined,
): Promise<{ deletedCount: number }> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { deletedCount: 0 };

  const { data, error } = await adminClient
    .from("failed_auth_reports")
    .delete()
    .eq("normalized_email", normalizedEmail)
    .is("admin_decision", null)
    .select("id");

  if (error) {
    devAuthLog("failed-auth-clear-on-login", {
      step: "delete_failed",
      email: normalizedEmail,
      error: error.message,
    });
    return { deletedCount: 0 };
  }

  const deletedCount = data?.length ?? 0;
  if (deletedCount > 0) {
    devAuthLog("failed-auth-clear-on-login", {
      step: "deleted",
      email: normalizedEmail,
      deletedCount,
    });
  }

  return { deletedCount };
}
