"use client";

import { useEffect, useMemo, useState } from "react";

import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";
import { useRequireFullAccess } from "../../hooks/useRequireFullAccess";

type DigestLog = {
  id: string;
  user_id: string;
  recipient_name: string;
  recipient_email: string | null;
  digest_type: "morning" | "evening";
  window_start: string;
  window_end: string;
  sent_at: string;
  status: "sending" | "sent" | "skipped" | "failed";
  resend_message_id: string | null;
  error_message: string | null;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminDigestLogsPage() {
  useRequireFullAccess("app/admin/digests/page.tsx");
  const { t } = useTheme();
  const [logs, setLogs] = useState<DigestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        window.location.href = "/login";
        return;
      }

      const res = await fetch("/api/admin/digest-send-logs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Could not load digest logs.");
      } else {
        setLogs((json.logs ?? []) as DigestLog[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    return logs.reduce(
      (acc, log) => ({ ...acc, [log.status]: acc[log.status] + 1 }),
      { sending: 0, sent: 0, skipped: 0, failed: 0 },
    );
  }, [logs]);

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: "24px 20px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <a href="/admin" style={{ color: t.textMuted, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          Back to admin
        </a>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: "14px 0 8px" }}>Digest send logs</h1>
        <p style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 18px" }}>
          Last 100 email digest attempts, including sent, skipped, and failed recipients.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
          {(["sent", "skipped", "failed", "sending"] as const).map((status) => (
            <div key={status} style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 14 }}>
              <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 900, textTransform: "uppercase" }}>{status}</div>
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{counts[status]}</div>
            </div>
          ))}
        </div>

        <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, overflow: "hidden" }}>
          {loading && <div style={{ padding: 18, color: t.textMuted }}>Loading...</div>}
          {error && <div style={{ padding: 18, color: "#b91c1c", fontWeight: 800 }}>{error}</div>}
          {!loading && !error && logs.length === 0 && (
            <div style={{ padding: 18, color: t.textMuted }}>No digest logs yet.</div>
          )}
          {!loading && !error && logs.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>
                    <th style={{ textAlign: "left", padding: 12 }}>Recipient</th>
                    <th style={{ textAlign: "left", padding: 12 }}>Digest</th>
                    <th style={{ textAlign: "left", padding: 12 }}>Status</th>
                    <th style={{ textAlign: "left", padding: 12 }}>Send time</th>
                    <th style={{ textAlign: "left", padding: 12 }}>Window</th>
                    <th style={{ textAlign: "left", padding: 12 }}>Resend</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                      <td style={{ padding: 12, verticalAlign: "top" }}>
                        <div style={{ fontWeight: 800 }}>{log.recipient_name}</div>
                        <div style={{ color: t.textMuted, fontSize: 12 }}>{log.recipient_email ?? log.user_id}</div>
                      </td>
                      <td style={{ padding: 12, verticalAlign: "top", textTransform: "capitalize" }}>{log.digest_type}</td>
                      <td style={{ padding: 12, verticalAlign: "top" }}>
                        <div style={{ fontWeight: 900, textTransform: "capitalize" }}>{log.status}</div>
                        {log.error_message && <div style={{ color: t.textMuted, fontSize: 12, marginTop: 3 }}>{log.error_message}</div>}
                      </td>
                      <td style={{ padding: 12, verticalAlign: "top" }}>{formatDate(log.sent_at)}</td>
                      <td style={{ padding: 12, verticalAlign: "top", color: t.textMuted }}>
                        {formatDate(log.window_start)} - {formatDate(log.window_end)}
                      </td>
                      <td style={{ padding: 12, verticalAlign: "top", color: t.textMuted }}>
                        {log.resend_message_id ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
