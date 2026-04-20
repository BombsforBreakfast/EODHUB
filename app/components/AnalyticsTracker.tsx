"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";

// Owns client-side engagement tracking. Mounted once in the root layout.
//
// What it does:
//   - On mount, opens an analytics session + first page_view (server side).
//   - On route change, closes the previous page_view and opens a new one.
//   - Every 30s while the tab is visible AND the user has been active in the
//     last 60s, posts a heartbeat that bumps active_ms on session + page_view.
//   - On visibility-hidden / pagehide, flushes remaining active_ms via
//     navigator.sendBeacon so we don't lose the tail of a session.
//
// What it does NOT do:
//   - Track on /admin/* (avoid polluting numbers with admin browsing)
//   - Send anything when the user is idle (no input >60s)
//   - Send anything before mount on the server

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_THRESHOLD_MS = 60_000;
const ANON_VISITOR_KEY = "eod_analytics_visitor_id";
const TRACK_URL = "/api/analytics/track";

function ensureAnonymousVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(ANON_VISITOR_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(ANON_VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function shouldSkip(path: string | null | undefined): boolean {
  if (!path) return true;
  if (path.startsWith("/admin")) return true;
  if (path.startsWith("/api/")) return true;
  return false;
}

async function getAuthHeader(): Promise<HeadersInit> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  } catch {
    // ignore
  }
  return { "Content-Type": "application/json" };
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const sessionIdRef = useRef<string | null>(null);
  const pageViewIdRef = useRef<string | null>(null);
  const lastActivityAtRef = useRef<number>(Date.now());
  const lastTickAtRef = useRef<number>(Date.now());
  const startedRef = useRef(false);
  const currentPathRef = useRef<string | null>(null);

  // ── Track user activity (mouse/keyboard/touch/scroll) ──────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mark = () => {
      lastActivityAtRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];
    for (const ev of events) window.addEventListener(ev, mark, { passive: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, mark);
    };
  }, []);

  // ── Start session on first allowed pathname ────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (startedRef.current) return;
    if (shouldSkip(pathname)) return;

    let cancelled = false;
    void (async () => {
      const headers = await getAuthHeader();
      try {
        const res = await fetch(TRACK_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "start",
            path: pathname,
            anonymous_visitor_id: ensureAnonymousVisitorId(),
          }),
          keepalive: true,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { session_id?: string; page_view_id?: string };
        if (cancelled) return;
        if (json.session_id && json.page_view_id) {
          sessionIdRef.current = json.session_id;
          pageViewIdRef.current = json.page_view_id;
          currentPathRef.current = pathname;
          startedRef.current = true;
          lastTickAtRef.current = Date.now();
          lastActivityAtRef.current = Date.now();
        }
      } catch {
        // network errors are silently ignored — analytics must never break the app
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // ── Route change: close previous page_view, open a new one ─────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!startedRef.current) return;
    if (!sessionIdRef.current || !pageViewIdRef.current) return;
    if (shouldSkip(pathname)) return;
    if (currentPathRef.current === pathname) return;

    const now = Date.now();
    const sinceLast = now - lastTickAtRef.current;
    const sinceActivity = now - lastActivityAtRef.current;
    const delta =
      sinceActivity < IDLE_THRESHOLD_MS && document.visibilityState === "visible"
        ? Math.max(0, sinceLast)
        : 0;
    lastTickAtRef.current = now;

    void (async () => {
      const headers = await getAuthHeader();
      try {
        const res = await fetch(TRACK_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "navigate",
            session_id: sessionIdRef.current,
            page_view_id: pageViewIdRef.current,
            delta_ms: delta,
            path: pathname,
          }),
          keepalive: true,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { page_view_id?: string };
        if (json.page_view_id) {
          pageViewIdRef.current = json.page_view_id;
          currentPathRef.current = pathname;
        }
      } catch {
        // ignore
      }
    })();
  }, [pathname]);

  // ── Heartbeat loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      if (!sessionIdRef.current || !pageViewIdRef.current) return;
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const sinceLast = now - lastTickAtRef.current;
      const sinceActivity = now - lastActivityAtRef.current;
      lastTickAtRef.current = now;
      // Only credit active_ms if user has been active recently. Bump anyway so
      // the session is not considered stale, but with delta=0.
      const delta = sinceActivity < IDLE_THRESHOLD_MS ? Math.max(0, sinceLast) : 0;
      void (async () => {
        const headers = await getAuthHeader();
        try {
          await fetch(TRACK_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "heartbeat",
              session_id: sessionIdRef.current,
              page_view_id: pageViewIdRef.current,
              delta_ms: delta,
            }),
            keepalive: true,
          });
        } catch {
          // ignore
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── Flush on hide / pagehide so we don't lose the tail of a session ────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = (action: "heartbeat" | "end") => {
      if (!sessionIdRef.current || !pageViewIdRef.current) return;
      const now = Date.now();
      const sinceLast = now - lastTickAtRef.current;
      const sinceActivity = now - lastActivityAtRef.current;
      lastTickAtRef.current = now;
      const delta = sinceActivity < IDLE_THRESHOLD_MS ? Math.max(0, sinceLast) : 0;
      const payload = JSON.stringify({
        action,
        session_id: sessionIdRef.current,
        page_view_id: pageViewIdRef.current,
        delta_ms: delta,
      });
      try {
        // sendBeacon is the only reliable way to send during pagehide; it ignores
        // headers (no auth), so the server records the activity as anonymous if the
        // user wasn't already mapped via prior heartbeats. That's fine — the
        // session row already has user_id from "start".
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon?.(TRACK_URL, blob);
      } catch {
        // ignore
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") flush("heartbeat");
    };
    const onHide = () => flush("end");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return null;
}
