"use client";

import type { TrafficByHourSummary } from "../../lib/analyticsTrafficByHour";

type Theme = {
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderLight: string;
  surface: string;
  badgeBg: string;
};

type Props = {
  data: TrafficByHourSummary;
  rangeLabel: string;
  formatDuration: (ms: number) => string;
  t: Theme;
  isMobile: boolean;
};

export default function TrafficByHourChart({
  data,
  rangeLabel,
  formatDuration,
  t,
  isMobile,
}: Props) {
  const metricKey = data.days_in_range === 1 ? "sessions" : "sessions_per_day";
  const maxMetric = Math.max(...data.buckets.map((b) => b[metricKey]), 0.1);
  const hasData = data.buckets.some((b) => b.sessions > 0);

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 16, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>Traffic by time of day</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
            When members are on the platform ({rangeLabel}, {data.timezone_label})
          </div>
        </div>
        {data.peak_window_label && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: t.badgeBg,
              border: `1px solid ${t.borderLight}`,
              maxWidth: 320,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Best time to post
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginTop: 4 }}>
              {data.peak_window_label}
            </div>
            {data.peak_hours.length > 0 && (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                {data.days_in_range === 1
                  ? `${data.peak_hours[0].sessions_per_day.toLocaleString()} sessions at peak`
                  : `~${data.peak_hours[0].sessions_per_day.toLocaleString()} sessions/day at peak`}
              </div>
            )}
          </div>
        )}
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13, color: t.textFaint }}>No session data in this range yet.</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(12, minmax(22px, 1fr))" : "repeat(24, minmax(0, 1fr))",
              gap: isMobile ? 4 : 6,
              alignItems: "end",
              minHeight: 160,
              padding: "8px 0 4px",
              overflowX: isMobile ? "auto" : undefined,
            }}
          >
            {data.buckets.map((bucket) => {
              const value = bucket[metricKey];
              const heightPct = Math.max(4, Math.round((value / maxMetric) * 100));
              const isPeak = data.peak_hours.some((p) => p.hour === bucket.hour);
              return (
                <div
                  key={bucket.hour}
                  title={`${bucket.label}: ${bucket.sessions.toLocaleString()} sessions, ${formatDuration(bucket.active_ms)} active`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    minWidth: isMobile ? 22 : 0,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 120,
                      display: "flex",
                      alignItems: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: `${heightPct}%`,
                        borderRadius: 4,
                        background: isPeak ? "#111" : "#cbd5e1",
                        minHeight: 4,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: isMobile ? 8 : 10,
                      color: isPeak ? t.text : t.textFaint,
                      fontWeight: isPeak ? 700 : 500,
                      writingMode: isMobile ? undefined : "vertical-rl",
                      transform: isMobile ? undefined : "rotate(180deg)",
                      textAlign: "center",
                      lineHeight: 1,
                    }}
                  >
                    {isMobile ? bucket.hour : bucket.label.replace(" ", "\u00a0")}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
              gap: 10,
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${t.borderLight}`,
            }}
          >
            <MetricHint
              label={data.days_in_range === 1 ? "Metric" : "Average metric"}
              value={data.days_in_range === 1 ? "Sessions per hour" : "Sessions per hour per day"}
              t={t}
            />
            <MetricHint label="Timezone" value={data.timezone_label} t={t} />
            <MetricHint
              label="Use for"
              value="Feed posts, push notifications, and social media timing"
              t={t}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MetricHint({ label, value, t }: { label: string; value: string; t: Theme }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>{label}</div>
      <div style={{ fontSize: 12, color: t.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}
