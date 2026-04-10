import type { SupabaseClient } from "@supabase/supabase-js";

export type PostNotifyResult = { ok: true } | { ok: false; reason: string };

/** Wait for auth to finish hydrating (slow tab load) before giving up. */
const SESSION_WAIT_MS = 12_000;
const SESSION_POLL_MS = 400;
/** Single retry after flaky network (not for HTTP 5xx — avoids spamming the API). */
const NETWORK_RETRY_DELAY_MS = 2800;

function isLikelyNetworkError(e: unknown): boolean {
  return (
    e instanceof TypeError ||
    (typeof e === "object" &&
      e !== null &&
      "name" in e &&
      (e as { name: string }).name === "AbortError")
  );
}

/**
 * Resolves a JWT for /api/notify. Polls briefly so slow initial loads still deliver.
 */
export async function resolveAccessTokenForNotify(supabase: SupabaseClient): Promise<string | null> {
  const { data: s0 } = await supabase.auth.getSession();
  if (s0.session?.access_token) return s0.session.access_token;
  const deadline = Date.now() + SESSION_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, SESSION_POLL_MS));
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  }
  return null;
}

/**
 * POST /api/notify and confirm success. No silent failures: failures are logged.
 * At most one extra attempt after a network error, or one retry after 401 + refresh.
 */
export async function postNotifyJson(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<PostNotifyResult> {
  let token = await resolveAccessTokenForNotify(supabase);
  if (!token) {
    console.warn("[postNotify] No session; notification not sent.");
    return { ok: false, reason: "no_session" };
  }

  const fetchOnce = async (accessToken: string) =>
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });

  try {
    let res = await fetchOnce(token);
    if (res.status === 401) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) console.warn("[postNotify] refreshSession failed", refreshErr);
      const t2 = refreshData.session?.access_token ?? (await resolveAccessTokenForNotify(supabase));
      if (t2) res = await fetchOnce(t2);
    }
    if (res.ok) return { ok: true };
    const errText = await res.text().catch(() => "");
    console.warn(`[postNotify] HTTP ${res.status}`, errText.slice(0, 240));
    return { ok: false, reason: `http_${res.status}` };
  } catch (e) {
    if (!isLikelyNetworkError(e)) {
      console.warn("[postNotify] Unexpected error", e);
      return { ok: false, reason: "unknown" };
    }
    await new Promise((r) => setTimeout(r, NETWORK_RETRY_DELAY_MS));
    try {
      const t3 = await resolveAccessTokenForNotify(supabase);
      if (!t3) {
        console.warn("[postNotify] No session after network error; notification not sent.");
        return { ok: false, reason: "no_session" };
      }
      const res = await fetchOnce(t3);
      if (res.ok) return { ok: true };
      const errText = await res.text().catch(() => "");
      console.warn(`[postNotify] Retry HTTP ${res.status}`, errText.slice(0, 240));
      return { ok: false, reason: `http_${res.status}` };
    } catch (e2) {
      console.warn("[postNotify] Network retry failed", e2);
      return { ok: false, reason: "network" };
    }
  }
}
