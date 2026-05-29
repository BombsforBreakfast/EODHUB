"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import {
  formatBytes,
  formatCount,
  pctOfLimit,
  SUPABASE_USAGE_REVIEW_STORAGE_KEY,
  type UsageLevel,
  usageLevel,
} from "@/app/lib/supabaseTierLimits";

type ThemeTokens = {
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderLight: string;
  surface: string;
  bg: string;
  badgeBg: string;
};

type UsagePayload = {
  plan: "free" | "pro";
  projectRef: string | null;
  dashboard: {
    usage: string;
    subscription: string;
    storage: string;
    logs: string;
  };
  limits: {
    mau: number;
    databaseBytes: number;
    storageBytes: number;
    egressBytes: number;
    realtimePeakConnections: number;
  };
  watchThresholds: {
    mau: number;
    databaseBytes: number;
    storageBytes: number;
    egressBytes: number;
    realtimePeakConnections: number;
  };
  snapshot: {
    database_bytes: number;
    storage_bytes: number;
    registered_profiles: number;
    auth_mau_approx: number;
    captured_at: string;
  } | null;
  snapshotError: string | null;
  notes: {
    egress: string;
    realtime: string;
    mau: string;
  };
  upgradeRecommendation: string | null;
  planSummary: string;
  monthlyReviewChecklist: string[];
  giphy: {
    plan: "development" | "production";
    dashboardUrl: string;
    limits: { callsPerHour: number };
    watchThresholds: { callsPerHour: number };
    callsLastHour: number;
    error: string | null;
    upgradeRecommendation: string;
  };
};

function levelColor(level: UsageLevel, isDark: boolean): string {
  if (level === "critical") return isDark ? "#fca5a5" : "#b91c1c";
  if (level === "watch") return isDark ? "#fcd34d" : "#b45309";
  return isDark ? "#86efac" : "#15803d";
}

function levelBg(level: UsageLevel, isDark: boolean): string {
  if (level === "critical") return isDark ? "#450a0a" : "#fef2f2";
  if (level === "watch") return isDark ? "#422006" : "#fffbeb";
  return isDark ? "#052e16" : "#f0fdf4";
}

function UsageMeter({
  t,
  isDark,
  label,
  current,
  limit,
  watchAt,
  sub,
  tierLabel,
}: {
  t: ThemeTokens;
  isDark: boolean;
  label: string;
  current: number;
  limit: number;
  watchAt: number;
  sub?: string;
  tierLabel: string;
}) {
  const level = usageLevel(current, limit, watchAt);
  const pct = pctOfLimit(current, limit);

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        background: t.surface,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{label}</div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: levelColor(level, isDark),
            background: levelBg(level, isDark),
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          {level === "ok" ? "OK" : level === "watch" ? "Watch" : "At limit"}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: t.text }}>
        {typeof current === "number" && limit >= 1024 * 1024
          ? formatBytes(current)
          : formatCount(current)}
        <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted }}>
          {" "}
          / {limit >= 1024 * 1024 ? formatBytes(limit) : formatCount(limit)}
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 8,
          borderRadius: 999,
          background: t.badgeBg,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: levelColor(level, isDark),
            borderRadius: 999,
            transition: "width 0.3s ease",
          }}
        />
        <div
          title={`80% watch threshold (${limit >= 1024 * 1024 ? formatBytes(watchAt) : formatCount(watchAt)})`}
          style={{
            position: "absolute",
            left: "80%",
            top: 0,
            bottom: 0,
            width: 2,
            background: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)",
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: t.textMuted }}>
        {pct}% of {tierLabel} · watch at 80%
        {sub ? ` · ${sub}` : ""}
      </div>
    </div>
  );
}

export default function SupabaseUsagePanel({ t, isDark }: { t: ThemeTokens; isDark: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UsagePayload | null>(null);
  const [lastReviewed, setLastReviewed] = useState<string | null>(null);
  const [checklistDone, setChecklistDone] = useState<boolean[]>([]);

  const reviewChecklist = data?.monthlyReviewChecklist ?? [];
  const tierLabel = data?.plan === "pro" ? "Pro tier" : "Free tier";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Not signed in.");
        return;
      }
      const res = await fetch("/api/admin/supabase-usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as UsagePayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to load usage.");
        return;
      }
      setData(json);
      setChecklistDone((json.monthlyReviewChecklist ?? []).map(() => false));
    } catch (err) {
      console.error("Supabase usage load error:", err);
      setError("Failed to load usage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(SUPABASE_USAGE_REVIEW_STORAGE_KEY);
    if (stored) setLastReviewed(stored);
  }, []);

  const reviewDue = useMemo(() => {
    if (!lastReviewed) return true;
    const then = new Date(lastReviewed);
    if (Number.isNaN(then.getTime())) return true;
    const days = (Date.now() - then.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 30;
  }, [lastReviewed]);

  function markReviewComplete() {
    const iso = new Date().toISOString();
    localStorage.setItem(SUPABASE_USAGE_REVIEW_STORAGE_KEY, iso);
    setLastReviewed(iso);
    setChecklistDone(reviewChecklist.map(() => false));
  }

  const snap = data?.snapshot;
  const giphy = data?.giphy;
  const giphyLevel =
    giphy?.plan === "development"
      ? usageLevel(
          giphy.callsLastHour,
          giphy.limits.callsPerHour,
          giphy.watchThresholds.callsPerHour,
        )
      : "ok";

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
      {data?.plan === "free" && data.upgradeRecommendation && (
        <div
          style={{
            border: `1px solid ${isDark ? "#854d0e" : "#fcd34d"}`,
            borderRadius: 14,
            padding: "16px 18px",
            background: isDark ? "#1c1917" : "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 15, color: t.text, marginBottom: 6 }}>
            Upgrade to Pro before public launch
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
            {data.upgradeRecommendation} At 4–5k users you are still well under the 50k MAU cap,
            but image storage, egress, and Realtime connections are the limits most likely to bite first.
          </div>
          <a
            href={data.dashboard.subscription}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 8,
              background: "#111",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Open Supabase billing ↗
          </a>
        </div>
      )}

      {data?.plan === "pro" && data.planSummary && (
        <div
          style={{
            border: `1px solid ${isDark ? "#166534" : "#86efac"}`,
            borderRadius: 14,
            padding: "16px 18px",
            background: isDark ? "#052e16" : "#f0fdf4",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 15, color: t.text, marginBottom: 6 }}>
            Supabase Pro active
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
            {data.planSummary}
          </div>
        </div>
      )}

      {giphy?.plan === "development" && (giphyLevel === "watch" || giphyLevel === "critical") && (
        <div
          style={{
            border: `1px solid ${isDark ? "#854d0e" : "#fcd34d"}`,
            borderRadius: 14,
            padding: "16px 18px",
            background: isDark ? "#1c1917" : "#fffbeb",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 15, color: t.text, marginBottom: 6 }}>
            Upgrade GIPHY to Production
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
            {giphy.upgradeRecommendation} Current rolling hour:{" "}
            <strong>{formatCount(giphy.callsLastHour)}</strong> /{" "}
            {formatCount(giphy.limits.callsPerHour)} calls.
          </div>
          <a
            href={giphy.dashboardUrl}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 8,
              background: "#111",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Open GIPHY developer dashboard ↗
          </a>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: t.text }}>GIPHY API</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
            Plan: <strong>{giphy?.plan ?? "…"}</strong>
            {giphy?.plan === "development" && " · rolling last 60 minutes"}
          </div>
        </div>
        {giphy?.dashboardUrl && (
          <a
            href={giphy.dashboardUrl}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              fontWeight: 700,
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            GIPHY dashboard ↗
          </a>
        )}
      </div>

      {giphy?.error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: isDark ? "#422006" : "#fffbeb",
            border: `1px solid ${isDark ? "#854d0e" : "#fcd34d"}`,
            color: t.text,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong>GIPHY call tracking unavailable.</strong> Run migration{" "}
          <code>20260524130000_giphy_api_calls.sql</code> in the Supabase SQL editor, then refresh. (
          {giphy.error})
        </div>
      )}

      {giphy?.plan === "development" && !giphy.error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <UsageMeter
            t={t}
            isDark={isDark}
            label="API calls (last hour)"
            current={giphy.callsLastHour}
            limit={giphy.limits.callsPerHour}
            watchAt={giphy.watchThresholds.callsPerHour}
            sub="Dev tier cap · upgrade to Production near 80/hr"
            tierLabel="Dev tier"
          />
        </div>
      )}

      {giphy?.plan === "production" && (
        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: "14px 16px",
            background: t.surface,
            fontSize: 13,
            color: t.textMuted,
            lineHeight: 1.5,
          }}
        >
          Production GIPHY key configured (<code>GIPHY_PLAN=production</code>). Hourly dev-tier
          monitoring is disabled.
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: t.text }}>Supabase usage</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
            Plan: <strong>{data?.plan ?? "…"}</strong>
            {data?.projectRef ? ` · project ${data.projectRef}` : ""}
            {snap?.captured_at && (
              <> · snapshot {new Date(snap.captured_at).toLocaleString()}</>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              fontWeight: 700,
              fontSize: 12,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {data?.dashboard.usage && (
            <a
              href={data.dashboard.usage}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                fontWeight: 700,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              Supabase usage dashboard ↗
            </a>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {data?.snapshotError && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: isDark ? "#422006" : "#fffbeb",
            border: `1px solid ${isDark ? "#854d0e" : "#fcd34d"}`,
            color: t.text,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong>Usage snapshot unavailable.</strong> Run migration{" "}
          <code>20260524120000_admin_supabase_usage_snapshot.sql</code> in the Supabase SQL editor,
          then refresh. ({data.snapshotError})
        </div>
      )}

      {snap && data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <UsageMeter
            t={t}
            isDark={isDark}
            label="File storage"
            current={snap.storage_bytes}
            limit={data.limits.storageBytes}
            watchAt={data.watchThresholds.storageBytes}
            sub="Highest risk for photo-heavy app"
            tierLabel={tierLabel}
          />
          <UsageMeter
            t={t}
            isDark={isDark}
            label="Database size"
            current={snap.database_bytes}
            limit={data.limits.databaseBytes}
            watchAt={data.watchThresholds.databaseBytes}
            tierLabel={tierLabel}
          />
          <UsageMeter
            t={t}
            isDark={isDark}
            label="Auth MAU (approx.)"
            current={snap.auth_mau_approx}
            limit={data.limits.mau}
            watchAt={data.watchThresholds.mau}
            sub={`${formatCount(snap.registered_profiles)} registered profiles`}
            tierLabel={tierLabel}
          />
        </div>
      )}

      <div
        style={{
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: "16px 18px",
          background: t.surface,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 6 }}>
          Check in Supabase dashboard (not measurable here)
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 12 }}>
          {data?.notes.egress} {data?.notes.realtime}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, color: t.text }}>
            <strong>Egress</strong> — watch at {formatBytes(data?.watchThresholds.egressBytes ?? 0)}{" "}
            of {formatBytes(data?.limits.egressBytes ?? 0)}
          </div>
          <div style={{ fontSize: 12, color: t.text }}>
            <strong>Realtime connections</strong> — watch at{" "}
            {formatCount(data?.watchThresholds.realtimePeakConnections ?? 0)} of{" "}
            {formatCount(data?.limits.realtimePeakConnections ?? 0)} peak
          </div>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${reviewDue ? (isDark ? "#854d0e" : "#fcd34d") : t.border}`,
          borderRadius: 14,
          padding: "16px 18px",
          background: reviewDue ? (isDark ? "#1c1917" : "#fffbeb") : t.surface,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: t.text }}>Monthly usage review</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
              {lastReviewed
                ? `Last marked complete: ${new Date(lastReviewed).toLocaleDateString()}`
                : "Not recorded yet — complete after checking Supabase billing usage."}
              {reviewDue && (
                <span style={{ fontWeight: 700, color: isDark ? "#fcd34d" : "#b45309" }}>
                  {" "}
                  · Review due (30+ days)
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={markReviewComplete}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "white",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Mark review complete
          </button>
        </div>
        <ul style={{ margin: "14px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
          {reviewChecklist.map((item, i) => (
            <li key={item} style={{ fontSize: 13, color: t.text, listStyle: "disc" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checklistDone[i]}
                  onChange={(e) => {
                    const next = [...checklistDone];
                    next[i] = e.target.checked;
                    setChecklistDone(next);
                  }}
                  style={{ marginTop: 3 }}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
