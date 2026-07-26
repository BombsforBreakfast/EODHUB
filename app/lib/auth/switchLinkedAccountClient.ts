import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccessTokenForNotify } from "@/app/lib/postNotifyClient";

export type SwitchLinkedAccountResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

/**
 * Replace the current Supabase session with a linked account (same-email or
 * ownership-linked business), then hard-navigate so shell/paywall rebuild.
 */
export async function switchToLinkedAccount(opts: {
  supabase: SupabaseClient;
  targetUserId: string;
  queryClient?: QueryClient;
  /** Defaults to the target profile wall. */
  redirectTo?: string;
}): Promise<SwitchLinkedAccountResult> {
  const token = await resolveAccessTokenForNotify(opts.supabase);
  if (!token) {
    return { ok: false, error: "Not signed in" };
  }

  let res: Response;
  try {
    res = await fetch("/api/auth/switch-linked-account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetUserId: opts.targetUserId }),
    });
  } catch {
    return { ok: false, error: "Network error preparing account switch" };
  }

  const data = (await res.json().catch(() => ({}))) as {
    token_hash?: string;
    type?: string;
    error?: string;
    code?: string;
  };

  if (!res.ok || !data.token_hash) {
    return {
      ok: false,
      error: data.error ?? "Could not switch accounts",
      code: data.code,
    };
  }

  const { error: otpError } = await opts.supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "magiclink",
  });

  if (otpError) {
    return { ok: false, error: otpError.message };
  }

  try {
    opts.queryClient?.clear();
  } catch {
    /* ignore */
  }

  const redirectTo = opts.redirectTo ?? `/profile/${encodeURIComponent(opts.targetUserId)}`;
  if (typeof window !== "undefined") {
    window.location.assign(redirectTo);
  }
  return { ok: true };
}
