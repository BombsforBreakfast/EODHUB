"use client";

import { useEffect, useRef } from "react";
import { isExcludedAnalyticsUser } from "../lib/analyticsExclusions";
import { supabase } from "../lib/lib/supabaseClient";
import { useAuthOptional } from "../lib/auth/AuthProvider";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function effectiveDurationSeconds(startedAtMs: number, endedAtMs: number): number {
  return Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000));
}

async function endPageSession(
  sessionId: string,
  startedAtMs: number,
  accessToken: string | null,
  options?: { keepalive?: boolean }
): Promise<void> {
  const endedAt = new Date();
  const durationSeconds = effectiveDurationSeconds(startedAtMs, endedAt.getTime());
  const payload = {
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
  };

  if (options?.keepalive && SUPABASE_URL && SUPABASE_ANON_KEY && accessToken) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/page_sessions?id=eq.${encodeURIComponent(sessionId)}&ended_at=is.null`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(payload),
          keepalive: true,
        }
      );
      return;
    } catch {
      // fall through to client update
    }
  }

  try {
    await supabase
      .from("page_sessions")
      .update(payload)
      .eq("id", sessionId)
      .is("ended_at", null);
  } catch {
    // analytics must never break the app
  }
}

/**
 * Tracks authenticated time-on-page for a major app section.
 * No-ops for signed-out visitors and silently ignores network errors.
 */
export function usePageTracking(pagePath: string): void {
  const auth = useAuthOptional();
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const endingRef = useRef(false);
  const pagePathRef = useRef(pagePath);

  useEffect(() => {
    pagePathRef.current = pagePath;
  }, [pagePath]);

  useEffect(() => {
    if (!pagePath) return;
    if (auth?.isLoading) return;

    let cancelled = false;
    endingRef.current = false;
    sessionIdRef.current = null;

    async function startSession() {
      try {
        const user = auth?.user ?? null;
        if (!user || cancelled || isExcludedAnalyticsUser(user)) return;

        const { data, error } = await supabase
          .from("page_sessions")
          .insert({ user_id: user.id, page_path: pagePath })
          .select("id, started_at")
          .single();

        if (error || !data || cancelled) return;

        sessionIdRef.current = data.id;
        startedAtRef.current = new Date(data.started_at).getTime();
        endingRef.current = false;
      } catch {
        // ignore
      }
    }

    void startSession();

    const endIfActive = (opts?: { keepalive?: boolean }) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId || endingRef.current) return;
      endingRef.current = true;
      sessionIdRef.current = null;
      void endPageSession(sessionId, startedAtRef.current, auth?.accessToken ?? null, opts);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") endIfActive({ keepalive: true });
    };
    const onPageHide = () => endIfActive({ keepalive: true });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      endIfActive();
    };
  }, [auth?.accessToken, auth?.isLoading, auth?.user, pagePath]);
}
