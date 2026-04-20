"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";

type Visibility = "private" | "connections" | "public";
type RequestPolicy = "everyone" | "connections" | "nobody";

type PrivacyState = {
  privacy_wall_posts: Visibility;
  privacy_wall_photos: Visibility;
  privacy_show_online: boolean;
  privacy_discoverable: boolean;
  privacy_who_can_request: RequestPolicy;
};

const DEFAULTS: PrivacyState = {
  privacy_wall_posts: "public",
  privacy_wall_photos: "public",
  privacy_show_online: true,
  privacy_discoverable: true,
  privacy_who_can_request: "everyone",
};

const VIS_OPTIONS: { value: Visibility; label: string; help: string }[] = [
  { value: "private", label: "Only me", help: "Hidden from everyone except you." },
  { value: "connections", label: "People I know", help: "Visible to people you've connected with." },
  { value: "public", label: "Everyone", help: "Visible to all members of the site." },
];

export default function PrivacySettingsCard({ userId }: { userId: string }) {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof PrivacyState | null>(null);
  const [state, setState] = useState<PrivacyState>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("profiles")
        .select(
          "privacy_wall_posts, privacy_wall_photos, privacy_show_online, privacy_discoverable, privacy_who_can_request"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        console.error("Privacy load error:", err);
        setError("Couldn't load privacy settings.");
      } else if (data) {
        setState({
          privacy_wall_posts: (data.privacy_wall_posts as Visibility) ?? DEFAULTS.privacy_wall_posts,
          privacy_wall_photos: (data.privacy_wall_photos as Visibility) ?? DEFAULTS.privacy_wall_photos,
          privacy_show_online: data.privacy_show_online ?? DEFAULTS.privacy_show_online,
          privacy_discoverable: data.privacy_discoverable ?? DEFAULTS.privacy_discoverable,
          privacy_who_can_request:
            (data.privacy_who_can_request as RequestPolicy) ?? DEFAULTS.privacy_who_can_request,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Optimistic per-field updater. We persist each change immediately so the UI
  // doesn't need a Save button — matches the dark-mode toggle pattern in the
  // surrounding My Account page.
  async function update<K extends keyof PrivacyState>(key: K, value: PrivacyState[K]) {
    const prev = state[key];
    setState((s) => ({ ...s, [key]: value }));
    setSaving(key);
    setError(null);
    const { error: err } = await supabase
      .from("profiles")
      .update({ [key]: value })
      .eq("user_id", userId);
    setSaving(null);
    if (err) {
      console.error("Privacy save error:", err);
      setError(`Couldn't save ${labelFor(key)}.`);
      setState((s) => ({ ...s, [key]: prev }));
    }
  }

  const card: React.CSSProperties = useMemo(
    () => ({ border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 24px", background: t.surface }),
    [t.border, t.surface]
  );

  if (loading) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Privacy</div>
        <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Privacy</div>
      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginTop: 4, marginBottom: 14 }}>
        Control who can see your wall content and how you appear to other members.
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

      <SectionHeader text="My wall" t={t} />

      <VisibilityRow
        t={t}
        label="Pictures"
        description="Photos you've uploaded to your profile gallery."
        value={state.privacy_wall_photos}
        onChange={(v) => update("privacy_wall_photos", v)}
        saving={saving === "privacy_wall_photos"}
      />

      <VisibilityRow
        t={t}
        label="Posts"
        description="Posts on your wall, including ones others post to your wall."
        value={state.privacy_wall_posts}
        onChange={(v) => update("privacy_wall_posts", v)}
        saving={saving === "privacy_wall_posts"}
      />

      <SectionHeader text="General" t={t} />

      <ToggleRow
        t={t}
        label="Show when I'm online"
        description="Let other members see you in the “online now” strip."
        value={state.privacy_show_online}
        onChange={(v) => update("privacy_show_online", v)}
        saving={saving === "privacy_show_online"}
      />

      <ToggleRow
        t={t}
        label="Show me in suggestions"
        description="Appear in “People You May Know” and similar discovery surfaces."
        value={state.privacy_discoverable}
        onChange={(v) => update("privacy_discoverable", v)}
        saving={saving === "privacy_discoverable"}
      />

      <BinaryChoiceRow
        t={t}
        label="Connection requests"
        description="Who can send you a request to connect. “People I know” means members you share at least one connection with."
        value={state.privacy_who_can_request}
        options={[
          { value: "everyone", label: "Anyone" },
          { value: "connections", label: "People I know" },
          { value: "nobody", label: "Nobody" },
        ]}
        onChange={(v) => update("privacy_who_can_request", v)}
        saving={saving === "privacy_who_can_request"}
        last
      />
    </div>
  );
}

function labelFor(key: keyof PrivacyState): string {
  switch (key) {
    case "privacy_wall_posts":
      return "wall post visibility";
    case "privacy_wall_photos":
      return "wall photo visibility";
    case "privacy_show_online":
      return "online status";
    case "privacy_discoverable":
      return "discoverability";
    case "privacy_who_can_request":
      return "connection request setting";
  }
}

function SectionHeader({ text, t }: { text: string; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: t.textFaint,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginTop: 8,
        marginBottom: 6,
      }}
    >
      {text}
    </div>
  );
}

type RowProps = {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  description: string;
  saving: boolean;
  last?: boolean;
};

function VisibilityRow(
  props: RowProps & { value: Visibility; onChange: (v: Visibility) => void }
) {
  const { t, label, description, value, onChange, saving, last } = props;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderBottom: last ? "none" : `1px solid ${t.border}`,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>
          {label} {saving && <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 6 }}>saving…</span>}
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{description}</div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Visibility)}
        disabled={saving}
        title={VIS_OPTIONS.find((o) => o.value === value)?.help}
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 13,
          fontWeight: 700,
          minWidth: 140,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {VIS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow(
  props: RowProps & { value: boolean; onChange: (v: boolean) => void }
) {
  const { t, label, description, value, onChange, saving, last } = props;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderBottom: last ? "none" : `1px solid ${t.border}`,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>
          {label} {saving && <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 6 }}>saving…</span>}
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        disabled={saving}
        aria-pressed={value}
        aria-label={`${label}: ${value ? "on" : "off"}`}
        style={{
          width: 52,
          height: 28,
          borderRadius: 14,
          border: "none",
          cursor: saving ? "wait" : "pointer",
          flexShrink: 0,
          background: value ? "#6366f1" : "#d1d5db",
          position: "relative",
          transition: "background 0.2s",
          padding: 0,
          opacity: saving ? 0.7 : 1,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: value ? 27 : 3,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
            display: "block",
          }}
        />
      </button>
    </div>
  );
}

function BinaryChoiceRow<T extends string>(
  props: RowProps & {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
  }
) {
  const { t, label, description, value, onChange, options, saving, last } = props;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderBottom: last ? "none" : `1px solid ${t.border}`,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>
          {label} {saving && <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 6 }}>saving…</span>}
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{description}</div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={saving}
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 13,
          fontWeight: 700,
          minWidth: 140,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
