"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { FAILED_AUTH_REASONS } from "../../lib/auth/failedAuthReasons";
import type {
  FailedAuthApiResponse,
  FailedAuthReportGroup,
  FailedAuthReportRow,
} from "../../api/admin/failed-auth-reports/route";

type Range = "24h" | "7d" | "30d" | "all";
const RANGES: ReadonlyArray<{ id: Range; label: string }> = [
  { id: "24h", label: "Last 24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

type RiskFilter = "" | "LOW" | "MEDIUM" | "HIGH";

type ResolveAction = "provision_temp_password" | "dismiss";

function riskBadgeStyle(level: string): React.CSSProperties {
  if (level === "HIGH") {
    return {
      background: "rgba(220, 38, 38, 0.18)",
      color: "#fca5a5",
      border: "1px solid rgba(220, 38, 38, 0.5)",
    };
  }
  if (level === "MEDIUM") {
    return {
      background: "rgba(245, 158, 11, 0.18)",
      color: "#fbbf24",
      border: "1px solid rgba(245, 158, 11, 0.5)",
    };
  }
  return {
    background: "rgba(148, 163, 184, 0.16)",
    color: "#94a3b8",
    border: "1px solid rgba(148, 163, 184, 0.4)",
  };
}

function formatBool(value: boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatWaitlistStatus(status: FailedAuthReportGroup["waitlistStatus"]): string {
  if (status === "in_waitlist") return "yes";
  if (status === "not_in_waitlist") return "no";
  return "unknown";
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

export default function FailedAuthPanel() {
  const { t } = useTheme();
  const [range, setRange] = useState<Range>("24h");
  const [emailFilter, setEmailFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("");
  const [data, setData] = useState<FailedAuthApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ range });
      if (emailFilter.trim()) params.set("email", emailFilter.trim());
      if (ipFilter.trim()) params.set("ip", ipFilter.trim());
      if (reasonFilter) params.set("failure_reason", reasonFilter);
      if (riskFilter) params.set("risk_level", riskFilter);

      const res = await fetch(`/api/admin/failed-auth-reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        return;
      }
      const json = (await res.json()) as FailedAuthApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range, emailFilter, ipFilter, reasonFilter, riskFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Resolve a group (or single report). The server accepts either reportId
   * or normalizedEmail; we always prefer normalizedEmail when we have one
   * because a single approve/dismiss should clear every unresolved attempt
   * from that email in one shot.
   */
  const resolveGroup = useCallback(
    async (
      group: FailedAuthReportGroup,
      action: ResolveAction,
      notes?: string,
    ) => {
      const key = group.groupKey;
      setResolvingKey(key);
      setActionMessage(null);
      setError(null);
      try {
        const body: Record<string, string> = { action };
        if (group.normalizedEmail) {
          body.normalizedEmail = group.normalizedEmail;
        } else {
          // No email captured — fall back to first report id.
          const firstId = group.reportIds[0];
          if (!firstId) {
            setError("Group has no reports to resolve.");
            return;
          }
          body.reportId = firstId;
        }
        if (notes) body.notes = notes;

        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/failed-auth-reports/resolve", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          action?: string;
          emailSent?: boolean;
          emailSkippedReason?: string;
          resolvedCount?: number;
        };
        if (!res.ok) {
          setError(json.error ?? `Action failed (${res.status})`);
          return;
        }
        const count = json.resolvedCount ?? group.attemptCount;
        const noun = `${count} attempt${count === 1 ? "" : "s"}`;
        if (action === "provision_temp_password") {
          setActionMessage(`User approved and temporary password email sent. Resolved ${noun}.`);
        } else {
          setActionMessage(`Dismissed ${noun}.`);
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setResolvingKey(null);
      }
    },
    [load],
  );

  const summary = data?.summary;
  const reports = data?.reports ?? [];
  const groups = data?.groups ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: t.text }}>
          Failed Auth
        </h2>
        <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
          Failed login + signup attempts that need admin review. Approving emails a temporary
          password and forces the user through onboarding the next time they sign in.
        </div>
      </div>

      {/* Summary KPI cards — always reflect the last 24h regardless of selected range. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <SummaryCard t={t} label="Failed attempts 24h" value={summary?.total24h ?? 0} />
        <SummaryCard t={t} label="Turnstile failures 24h" value={summary?.turnstileFailures24h ?? 0} />
        <SummaryCard t={t} label="Account creation issues 24h" value={summary?.accountCreationFailures24h ?? 0} />
        <SummaryCard t={t} label="High-risk attempts 24h" value={summary?.highRisk24h ?? 0} highlight={(summary?.highRisk24h ?? 0) > 0} />
        <SummaryCard
          t={t}
          label="Top reason 24h"
          value={summary?.topFailureReason ? summary.topFailureReason.reason : "—"}
          sub={summary?.topFailureReason ? `${summary.topFailureReason.count} attempts` : undefined}
        />
      </div>

      {/* ── Triage queue: unresolved + last 30 days, grouped per email ─────── */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>
            Triage queue
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: t.textMuted }}>
              ({groups.length} {groups.length === 1 ? "email" : "emails"})
            </span>
          </div>
          <div style={{ fontSize: 12, color: t.textFaint }}>
            Unresolved attempts from the last 30 days, grouped by email.
          </div>
        </div>

        {actionMessage && (
          <div
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.45)",
              color: "#86efac",
              padding: 12,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {actionMessage}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(220, 38, 38, 0.12)",
              border: "1px solid rgba(220, 38, 38, 0.5)",
              color: "#fca5a5",
              padding: 12,
              borderRadius: 10,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {groups.length === 0 && !loading && !error && (
          <div
            style={{
              border: `1px dashed ${t.border}`,
              borderRadius: 10,
              padding: 24,
              textAlign: "center",
              color: t.textMuted,
              fontSize: 14,
            }}
          >
            Inbox zero — no failed attempts waiting for admin review.
          </div>
        )}

        {groups.map((group) => (
          <GroupCard
            key={group.groupKey}
            group={group}
            expanded={expandedGroupKey === group.groupKey}
            onToggle={() =>
              setExpandedGroupKey((cur) => (cur === group.groupKey ? null : group.groupKey))
            }
            resolving={resolvingKey === group.groupKey}
            onResolve={resolveGroup}
            expandedReportId={expandedReportId}
            onToggleReport={(id) =>
              setExpandedReportId((cur) => (cur === id ? null : id))
            }
          />
        ))}
      </div>

      {/* ── Archive / search: flat list with filters ───────────────────────── */}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>
          Archive &amp; search
        </div>
        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            background: t.surface,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {RANGES.map((r) => {
              const active = range === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${active ? t.text : t.border}`,
                    background: active ? t.text : t.bg,
                    color: active ? t.surface : t.text,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              style={{
                marginLeft: "auto",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <input
              type="search"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              placeholder="Email contains…"
              style={inputStyle(t)}
            />
            <input
              type="search"
              value={ipFilter}
              onChange={(e) => setIpFilter(e.target.value)}
              placeholder="IP contains…"
              style={inputStyle(t)}
            />
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              style={inputStyle(t)}
            >
              <option value="">All reasons</option>
              {FAILED_AUTH_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
              style={inputStyle(t)}
            >
              <option value="">All risk levels</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: 12, color: t.textFaint }}>
          Showing {reports.length} of {totalCount} matching reports (most recent first).
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {reports.length === 0 && !loading && !error && (
            <div
              style={{
                border: `1px dashed ${t.border}`,
                borderRadius: 10,
                padding: 24,
                textAlign: "center",
                color: t.textMuted,
                fontSize: 14,
              }}
            >
              No failed auth attempts match your filters.
            </div>
          )}
          {reports.map((row) => (
            <ReportRow
              key={row.id}
              row={row}
              expanded={expandedReportId === row.id}
              onToggle={() =>
                setExpandedReportId((cur) => (cur === row.id ? null : row.id))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  t,
  label,
  value,
  sub,
  highlight,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${highlight ? "rgba(220, 38, 38, 0.55)" : t.border}`,
        borderRadius: 14,
        background: highlight ? "rgba(220, 38, 38, 0.08)" : t.surface,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          color: highlight ? "#fca5a5" : t.text,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 2, fontSize: 12, color: t.textFaint }}>{sub}</div>
      )}
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    background: t.input,
    color: t.text,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  };
}

function decisionBadgeStyle(decision: string): React.CSSProperties {
  if (decision === "provisioned") {
    return {
      background: "rgba(34, 197, 94, 0.18)",
      color: "#86efac",
      border: "1px solid rgba(34, 197, 94, 0.5)",
    };
  }
  if (decision === "block_overridden") {
    return {
      background: "rgba(59, 130, 246, 0.18)",
      color: "#93c5fd",
      border: "1px solid rgba(59, 130, 246, 0.5)",
    };
  }
  return {
    background: "rgba(148, 163, 184, 0.16)",
    color: "#94a3b8",
    border: "1px solid rgba(148, 163, 184, 0.4)",
  };
}

function GroupCard({
  group,
  expanded,
  onToggle,
  resolving,
  onResolve,
  expandedReportId,
  onToggleReport,
}: {
  group: FailedAuthReportGroup;
  expanded: boolean;
  onToggle: () => void;
  resolving: boolean;
  onResolve: (
    group: FailedAuthReportGroup,
    action: ResolveAction,
    notes?: string,
  ) => Promise<void>;
  expandedReportId: string | null;
  onToggleReport: (id: string) => void;
}) {
  const { t } = useTheme();
  const [notes, setNotes] = useState("");
  const riskStyle = useMemo(
    () => riskBadgeStyle(group.latestRiskLevel),
    [group.latestRiskLevel],
  );

  const displayEmail = group.displayEmail ?? group.normalizedEmail ?? "(no email captured)";
  const hasEmail = Boolean(group.normalizedEmail);
  const canApprove = hasEmail && group.classification.adminCanOverride;

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        background: t.surface,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 999,
            ...riskStyle,
          }}
        >
          {group.latestRiskLevel}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: t.text, wordBreak: "break-all" }}>
          {displayEmail}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 999,
            background: t.bg,
            color: t.text,
            border: `1px solid ${t.border}`,
          }}
        >
          {group.attemptCount} attempt{group.attemptCount === 1 ? "" : "s"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
          last {formatDate(group.latestCreatedAt)}
        </span>
      </div>

      <div style={{ fontSize: 13, color: t.textMuted, display: "grid", gap: 4 }}>
        <div>
          <strong style={{ color: t.text }}>Latest reason:</strong> {group.latestReason}
          {group.latestErrorCode && <span> · {group.latestErrorCode}</span>}
        </div>
        <div style={{ color: group.classification.suspicious ? "#fca5a5" : t.textMuted }}>
          <strong style={{ color: t.text }}>Review:</strong> {group.classification.displayReason}
        </div>
        {group.failureReasons.length > 1 && (
          <div style={{ fontSize: 12, color: t.textFaint }}>
            Other reasons in window: {group.failureReasons.filter((r) => r !== group.latestReason).join(", ")}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
          <span>
            <span style={{ color: t.textFaint }}>IPs:</span>{" "}
            {group.ipAddresses.length > 0 ? group.ipAddresses.slice(0, 3).join(", ") : "—"}
            {group.ipAddresses.length > 3 && <span> +{group.ipAddresses.length - 3}</span>}
          </span>
          <span>
            <span style={{ color: t.textFaint }}>Exists (auth / profile):</span>{" "}
            {formatBool(group.userExistsInAuth)} / {formatBool(group.userExistsInProfiles)}
          </span>
          <span>
            <span style={{ color: t.textFaint }}>Waitlist:</span>{" "}
            {formatWaitlistStatus(group.waitlistStatus)}
          </span>
          {group.verificationStatus && (
            <span>
              <span style={{ color: t.textFaint }}>Verification:</span> {group.verificationStatus}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional admin notes (saved on every resolved report in this group)…"
          rows={2}
          style={{
            ...inputStyle(t),
            resize: "vertical",
            minHeight: 56,
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <ActionButton
            t={t}
            label={resolving ? "Working…" : "Approve & email temp password"}
            disabled={!canApprove || resolving}
            primary
            onClick={() => {
              const ok = window.confirm(
                `Email a temporary password to ${displayEmail}? This will resolve ${group.attemptCount} attempt${
                  group.attemptCount === 1 ? "" : "s"
                } and force onboarding on first sign-in.`,
              );
              if (ok) {
                void onResolve(group, "provision_temp_password", notes.trim() || undefined);
              }
            }}
          />
          <ActionButton
            t={t}
            label={`Dismiss all (${group.attemptCount})`}
            disabled={resolving}
            onClick={() => {
              const ok = window.confirm(
                `Dismiss ${group.attemptCount} attempt${group.attemptCount === 1 ? "" : "s"} from ${displayEmail}?`,
              );
              if (ok) {
                void onResolve(group, "dismiss", notes.trim() || undefined);
              }
            }}
          />
          <button
            type="button"
            onClick={onToggle}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: t.textMuted,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            {expanded ? "Hide attempts" : `Show ${group.attemptCount} attempt${group.attemptCount === 1 ? "" : "s"}`}
          </button>
        </div>
        {!hasEmail && (
          <div style={{ fontSize: 12, color: t.textFaint }}>
            Approve requires an email on the report. Dismiss is still available.
          </div>
        )}
        {hasEmail && !group.classification.adminCanOverride && (
          <div style={{ fontSize: 12, color: "#fca5a5" }}>
            Approval is blocked for this classification. Dismiss or investigate the suspicious signal first.
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ display: "grid", gap: 6 }}>
          {group.reports.map((row) => (
            <ReportRow
              key={row.id}
              row={row}
              expanded={expandedReportId === row.id}
              onToggle={() => onToggleReport(row.id)}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportRow({
  row,
  expanded,
  onToggle,
  nested,
}: {
  row: FailedAuthReportRow;
  expanded: boolean;
  onToggle: () => void;
  nested?: boolean;
}) {
  const { t } = useTheme();
  const riskStyle = useMemo(() => riskBadgeStyle(row.risk_level), [row.risk_level]);

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: nested ? 10 : 12,
        background: nested ? t.bg : t.surface,
        padding: nested ? 10 : 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 999,
            ...riskStyle,
          }}
        >
          {row.risk_level}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{row.failure_reason}</span>
        {row.admin_decision && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: 999,
              ...decisionBadgeStyle(row.admin_decision),
            }}
          >
            {row.admin_decision.replace(/_/g, " ")}
          </span>
        )}
        {row.error_code && (
          <span style={{ fontSize: 12, color: t.textMuted }}>· {row.error_code}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: t.textFaint, fontVariantNumeric: "tabular-nums" }}>
          {formatDate(row.created_at)}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gap: 4,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          fontSize: 13,
          color: t.textMuted,
        }}
      >
        <Field label="Email" value={row.email_attempted ?? row.normalized_email ?? "—"} text={t.text} />
        <Field label="IP" value={row.ip_address ?? "—"} text={t.text} />
        <Field label="Source" value={row.source_route ?? "—"} text={t.text} />
        <Field label="Attempts (1h)" value={row.attempt_count?.toString() ?? "—"} text={t.text} />
        <Field
          label="Exists (auth / profile)"
          value={`${formatBool(row.user_exists_in_auth)} / ${formatBool(row.user_exists_in_profiles)}`}
          text={t.text}
        />
        <Field label="Verification" value={row.verification_status ?? "—"} text={t.text} />
        <Field label="Turnstile" value={row.turnstile_status ?? "—"} text={t.text} />
        <Field label="Request ID" value={row.request_id} text={t.text} mono />
      </div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: "none",
          border: "none",
          color: t.textMuted,
          fontSize: 12,
          fontWeight: 700,
          textAlign: "left",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <div
          style={{
            display: "grid",
            gap: 6,
            padding: 10,
            background: nested ? t.surface : t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            fontSize: 12,
            color: t.textMuted,
          }}
        >
          <div>
            <strong style={{ color: t.text }}>User agent:</strong>{" "}
            <span style={{ wordBreak: "break-all" }}>{row.user_agent ?? "—"}</span>
          </div>
          <div>
            <strong style={{ color: t.text }}>Raw error:</strong>{" "}
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{row.raw_error_message ?? "—"}</span>
          </div>
          {row.turnstile_error && (
            <div>
              <strong style={{ color: t.text }}>Turnstile error:</strong> {row.turnstile_error}
            </div>
          )}
          {row.admin_decided_at && (
            <div>
              <strong style={{ color: t.text }}>Admin decision:</strong>{" "}
              {row.admin_decision} · {formatDate(row.admin_decided_at)}
            </div>
          )}
          {row.admin_notes && (
            <div>
              <strong style={{ color: t.text }}>Admin notes:</strong> {row.admin_notes}
            </div>
          )}
        </div>
      )}
      {!expanded && row.user_agent && (
        <div style={{ fontSize: 11, color: t.textFaint }} title={row.user_agent}>
          {truncate(row.user_agent, 60)}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  t,
  label,
  onClick,
  disabled,
  primary,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: primary ? "none" : `1px solid ${t.border}`,
        background: primary ? t.text : t.bg,
        color: primary ? t.surface : t.text,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  text,
  mono,
}: {
  label: string;
  value: string;
  text: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.7 }}>
        {label}
      </div>
      <div
        style={{
          color: text,
          fontWeight: 600,
          wordBreak: "break-all",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 12 : 13,
        }}
      >
        {value}
      </div>
    </div>
  );
}
