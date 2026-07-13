"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { useTheme } from "@/app/lib/ThemeContext";

type Campaign = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  scheduled_for: string;
  status: "scheduled" | "processing" | "sent" | "failed" | "canceled";
  sent_count: number;
  failed_count: number;
  invalid_token_count: number;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
};

type CampaignResponse = {
  campaigns: Campaign[];
  diagnostics: {
    apnsConfigured: boolean;
    iosTokenCount: number;
  };
};

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your admin session has expired.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export default function AdminPushCampaignsPanel() {
  const { t } = useTheme();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [diagnostics, setDiagnostics] = useState<CampaignResponse["diagnostics"] | null>(null);
  const [title, setTitle] = useState("EOD-HUB");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("/");
  const [delivery, setDelivery] = useState<"now" | "later">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/admin/push-campaigns", { headers, cache: "no-store" });
      const payload = (await response.json()) as CampaignResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load push campaigns.");
      setCampaigns(payload.campaigns);
      setDiagnostics(payload.diagnostics);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load push campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  async function submitCampaign() {
    setError(null);
    setSuccess(null);
    if (!title.trim() || !message.trim()) {
      setError("Add a title and message.");
      return;
    }
    if (delivery === "later" && !scheduledLocal) {
      setError("Choose a delivery date and time.");
      return;
    }
    if (
      delivery === "now" &&
      !window.confirm(`Send this push now to all ${diagnostics?.iosTokenCount ?? 0} registered iOS devices?`)
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/admin/push-campaigns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          body: message,
          link: link.trim() || "/",
          scheduledFor:
            delivery === "later" ? new Date(scheduledLocal).toISOString() : new Date().toISOString(),
        }),
      });
      const payload = (await response.json()) as { campaign?: Campaign; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not create push campaign.");

      const campaign = payload.campaign;
      if (campaign?.status === "failed") {
        setError(campaign.last_error ?? "The push campaign failed.");
      } else {
        setSuccess(
          delivery === "now"
            ? `Push complete: ${campaign?.sent_count ?? 0} delivered, ${campaign?.failed_count ?? 0} failed.`
            : `Push scheduled for ${new Date(campaign?.scheduled_for ?? scheduledLocal).toLocaleString()}.`,
        );
        setMessage("");
      }
      await loadCampaigns();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create push campaign.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelCampaign(id: string) {
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/admin/push-campaigns", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not cancel campaign.");
      await loadCampaigns();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel campaign.");
    }
  }

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.surface,
    color: t.text,
    padding: "10px 12px",
    fontSize: 14,
  };

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
      <section style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, background: t.surface }}>
        <h2 style={{ margin: 0, color: t.text, fontSize: 22 }}>Push notifications</h2>
        <p style={{ margin: "6px 0 16px", color: t.textMuted, fontSize: 14 }}>
          Send immediately or schedule an announcement for every registered iOS device that has push enabled.
        </p>

        {diagnostics && !diagnostics.apnsConfigured && (
          <div role="alert" style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", marginBottom: 14, fontWeight: 700 }}>
            Delivery is disabled: the APNs credentials are missing from Vercel.
          </div>
        )}
        {diagnostics && (
          <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 14 }}>
            Registered iOS devices: <strong style={{ color: t.text }}>{diagnostics.iosTokenCount}</strong>
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ color: t.text, fontWeight: 700, fontSize: 13 }}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 100))} maxLength={100} style={{ ...fieldStyle, marginTop: 5 }} />
          </label>
          <label style={{ color: t.text, fontWeight: 700, fontSize: 13 }}>
            Message
            <textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 500))} maxLength={500} rows={4} style={{ ...fieldStyle, marginTop: 5, resize: "vertical" }} />
            <span style={{ display: "block", textAlign: "right", color: t.textFaint, fontWeight: 500 }}>{message.length}/500</span>
          </label>
          <label style={{ color: t.text, fontWeight: 700, fontSize: 13 }}>
            Open this app path when tapped
            <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="/arcade" style={{ ...fieldStyle, marginTop: 5 }} />
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", gap: 18, color: t.text }}>
            <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Delivery</legend>
            <label><input type="radio" checked={delivery === "now"} onChange={() => setDelivery("now")} /> Send now</label>
            <label><input type="radio" checked={delivery === "later"} onChange={() => setDelivery("later")} /> Schedule</label>
          </fieldset>
          {delivery === "later" && (
            <label style={{ color: t.text, fontWeight: 700, fontSize: 13 }}>
              Date and time
              <input type="datetime-local" value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} style={{ ...fieldStyle, marginTop: 5 }} />
              <span style={{ display: "block", color: t.textFaint, fontWeight: 500, marginTop: 4 }}>Uses your current local time zone.</span>
            </label>
          )}

          {error && <div role="alert" style={{ color: "#dc2626", fontWeight: 700 }}>{error}</div>}
          {success && <div role="status" style={{ color: "#15803d", fontWeight: 700 }}>{success}</div>}
          <button
            type="button"
            onClick={() => void submitCampaign()}
            disabled={submitting || !diagnostics?.apnsConfigured}
            style={{ justifySelf: "start", border: 0, borderRadius: 10, padding: "11px 18px", background: "#1d4ed8", color: "white", fontWeight: 800, cursor: "pointer", opacity: submitting || !diagnostics?.apnsConfigured ? 0.55 : 1 }}
          >
            {submitting ? "Working…" : delivery === "now" ? "Send push now" : "Schedule push"}
          </button>
        </div>
      </section>

      <section style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 18, background: t.surface }}>
        <h3 style={{ margin: "0 0 12px", color: t.text }}>Campaign history</h3>
        {loading ? (
          <div style={{ color: t.textMuted }}>Loading…</div>
        ) : campaigns.length === 0 ? (
          <div style={{ color: t.textMuted }}>No push campaigns yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {campaigns.map((campaign) => (
              <div key={campaign.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, color: t.text }}>
                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <strong>{campaign.title}</strong>
                  <span style={{ textTransform: "capitalize", fontWeight: 800 }}>{campaign.status}</span>
                </div>
                <div style={{ marginTop: 4, color: t.textMuted }}>{campaign.body}</div>
                <div style={{ marginTop: 7, color: t.textFaint, fontSize: 12 }}>
                  {campaign.status === "scheduled" ? "Scheduled" : "Created"}: {new Date(campaign.scheduled_for).toLocaleString()}
                  {" · "}Delivered {campaign.sent_count} · Failed {campaign.failed_count}
                </div>
                {campaign.last_error && <div style={{ marginTop: 6, color: "#dc2626", fontSize: 12 }}>{campaign.last_error}</div>}
                {campaign.status === "scheduled" && (
                  <button type="button" onClick={() => void cancelCampaign(campaign.id)} style={{ marginTop: 8, border: `1px solid ${t.border}`, borderRadius: 8, background: t.surface, color: t.text, padding: "6px 10px", cursor: "pointer" }}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

