import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import { devAuthLog } from "@/app/lib/auth/signupErrors";

export function normalizeLoginEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

async function authUserExistsViaProfile(
  adminClient: SupabaseClient,
  normalizedEmail: string,
): Promise<"exists" | "absent" | "unknown"> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("user_id")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    devAuthLog("login-guidance", {
      step: "profile_lookup_failed",
      error: error.message,
    });
    return "unknown";
  }

  return data?.user_id ? "exists" : "absent";
}

/**
 * Returns whether an auth account exists for this email.
 * - true: auth user found
 * - false: no auth user (safe to suggest account creation)
 * - null: lookup failed — caller should fall back to generic login error
 */
export async function authAccountExistsForEmail(
  normalizedEmail: string,
): Promise<boolean | null> {
  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    devAuthLog("login-guidance", { step: "missing_service_role" });
    return null;
  }

  const profileState = await authUserExistsViaProfile(client, normalizedEmail);
  if (profileState === "exists") {
    return true;
  }

  const { users, listError } = await findAuthUsersByEmail(client, normalizedEmail);
  if (listError) {
    devAuthLog("login-guidance", {
      step: "auth_lookup_failed",
      error: listError,
      profileState,
    });
    // No profile row and auth list failed — treat as missing account so login
    // can still guide toward signup (matches admin override recovery path).
    if (profileState === "absent") {
      return false;
    }
    return null;
  }

  return users.length > 0;
}
