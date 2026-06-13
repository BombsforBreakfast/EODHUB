"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { isNativeApp } from "../../lib/native/isNativeApp";

type DigestFrequency = "twice_daily" | "daily" | "off";

type NotificationPreferenceState = {
  email_notifications: boolean;
  push_notifications: boolean;
  morning_digest: boolean;
  evening_digest: boolean;
  timezone: string;
  digest_frequency: DigestFrequency;
};

const DEFAULTS: NotificationPreferenceState = {
  email_notifications: true,
  push_notifications: true,
  morning_digest: true,
  evening_digest: true,
  timezone: "America/New_York",
  digest_frequency: "twice_daily",
};

export default function NotificationPreferencesCard({ userId }: { userId: string }) {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof NotificationPreferenceState | null>(null);
  const [state, setState] = useState<NotificationPreferenceState>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await supabase
        .from("notification_preferences")
        .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

      const { data, error: err } = await supabase
        .from("notification_preferences")
        .select("email_notifications, push_notifications, morning_digest, evening_digest, timezone, digest_frequency")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (err) {
        console.error("Notification preferences load error:", err);
        setError("Couldn't load notification preferences.");
      } else if (data) {
        setState({
          email_notifications: data.email_notifications ?? DEFAULTS.email_notifications,
          push_notifications: data.push_notifications ?? DEFAULTS.push_notifications,
          morning_digest: data.morning_digest ?? DEFAULTS.morning_digest,
          evening_digest: data.evening_digest ?? DEFAULTS.evening_digest,
          timezone: data.timezone ?? DEFAULTS.timezone,
          digest_frequency: (data.digest_frequency as DigestFrequency) ?? DEFAULTS.digest_frequency,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function update<K extends keyof NotificationPreferenceState>(
    key: K,
    value: NotificationPreferenceState[K],
  ) {
    const prev = state[key];
    setState((current) => ({ ...current, [key]: value }));
    setSaving(key);
    setError(null);
    const { error: err } = await supabase
      .from("notification_preferences")
      .update({ [key]: value })
      .eq("user_id", userId);
    setSaving(null);
    if (err) {
      console.error("Notification preferences save error:", err);
      setError("Couldn't save notification preferences.");
      setState((current) => ({ ...current, [key]: prev }));
    }
  }

  const card: React.CSSProperties = useMemo(
    () => ({
      border: `1px solid ${t.border}`,
      borderRadius: 16,
      padding: "18px 24px",
      background: t.surface,
    }),
    [t.border, t.surface],
  );

  if (loading) {
    return (
      <div id="notifications" style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Email notifications</div>
        <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted }}>Loading...</div>
      </div>
    );
  }

  return (
    <div id="notifications" style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Email notifications</div>
      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginTop: 4, marginBottom: 14 }}>
        Control the EOD-HUB email digests sent around 06:30 and 17:30 Eastern time.
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <ToggleRow
        t={t}
        label="Email notifications"
        description="Master switch for digest emails."
        value={state.email_notifications}
        onChange={(value) => update("email_notifications", value)}
        saving={saving === "email_notifications"}
      />

      <ToggleRow
        t={t}
        label="Push notifications"
        description={
          isNativeApp()
            ? "Alerts on this device for messages, mentions, and replies."
            : "Applies to the EOD-Hub iOS app when signed in on your phone."
        }
        value={state.push_notifications}
        onChange={(value) => update("push_notifications", value)}
        saving={saving === "push_notifications"}
      />

      <ChoiceRow
        t={t}
        label="Digest frequency"
        description="Daily sends only the morning digest. Off disables digest emails."
        value={state.digest_frequency}
        options={[
          { value: "twice_daily", label: "Morning and evening" },
          { value: "daily", label: "Morning only" },
          { value: "off", label: "Off" },
        ]}
        onChange={(value) => update("digest_frequency", value)}
        saving={saving === "digest_frequency"}
      />

      <ToggleRow
        t={t}
        label="Morning digest"
        description="Around 06:30 Eastern time."
        value={state.morning_digest}
        onChange={(value) => update("morning_digest", value)}
        saving={saving === "morning_digest"}
      />

      <ToggleRow
        t={t}
        label="Evening digest"
        description="Around 17:30 Eastern time."
        value={state.evening_digest}
        onChange={(value) => update("evening_digest", value)}
        saving={saving === "evening_digest"}
      />

      <div style={{ paddingTop: 12, borderTop: `1px solid ${t.border}`, marginTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Digest timezone</div>
        <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: t.textMuted }}>
          {state.timezone}. For beta, EOD-HUB sends digests using one operating timezone; per-user local
          delivery can come later.
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  t,
  label,
  description,
  value,
  onChange,
  saving,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  saving: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: `1px solid ${t.border}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{label}</div>
        <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.45, color: t.textMuted }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        disabled={saving}
        aria-pressed={value}
        style={{
          minWidth: 52,
          height: 28,
          borderRadius: 999,
          border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          background: value ? "#16a34a" : "#6b7280",
          color: "white",
          fontSize: 11,
          fontWeight: 900,
          opacity: saving ? 0.65 : 1,
        }}
      >
        {value ? "On" : "Off"}
      </button>
    </div>
  );
}

function ChoiceRow({
  t,
  label,
  description,
  value,
  options,
  onChange,
  saving,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  description: string;
  value: DigestFrequency;
  options: { value: DigestFrequency; label: string }[];
  onChange: (value: DigestFrequency) => void;
  saving: boolean;
}) {
  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.45, color: t.textMuted }}>{description}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={saving}
            style={{
              border: `1px solid ${value === option.value ? t.text : t.border}`,
              background: value === option.value ? t.text : t.surface,
              color: value === option.value ? t.surface : t.text,
              borderRadius: 999,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 800,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.65 : 1,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
