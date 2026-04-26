"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { useMasterShell } from "../master/masterShellContext";

/**
 * My Account: home feed can auto-insert large "In Memoriam" cards on anniversaries.
 * Some members prefer to hide only those feed posts; calendars and /events are unchanged.
 */
export default function MemorialFeedPreferencesCard({ userId }: { userId: string }) {
  const { t } = useTheme();
  const { setShowMemorialFeedCards } = useMasterShell();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const card = useMemo(
    () => ({ border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 24px", background: t.surface }),
    [t.border, t.surface]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("show_memorial_feed_cards")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        console.error("Memorial feed pref load error:", err);
        setError("Could not load this setting.");
      } else {
        setValue((data as { show_memorial_feed_cards?: boolean | null } | null)?.show_memorial_feed_cards !== false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onToggle = useCallback(
    async (next: boolean) => {
      const prev = value;
      setValue(next);
      setShowMemorialFeedCards(next);
      setSaving(true);
      setError(null);
      const { error: err } = await supabase
        .from("profiles")
        .update({ show_memorial_feed_cards: next })
        .eq("user_id", userId);
      setSaving(false);
      if (err) {
        console.error("Memorial feed pref save error:", err);
        setError("Could not save. Try again.");
        setValue(prev);
        setShowMemorialFeedCards(prev);
      }
    },
    [userId, setShowMemorialFeedCards, value]
  );

  if (loading) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Memorials on the home feed</div>
        <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Memorials on the home feed</div>
      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginTop: 4, marginBottom: 14 }}>
        On a member&apos;s death anniversary, a large <strong>In Memoriam</strong> post can appear in the main
        feed. Turn this off if you find that difficult—your calendars and the Events page still list memorials when
        you choose to go there.
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>
            Show anniversary memorial posts
            {saving && <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 6 }}>saving…</span>}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>In the main home feed only.</div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!value)}
          disabled={saving}
          aria-pressed={value}
          aria-label={`Show anniversary memorial posts: ${value ? "on" : "off"}`}
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
    </div>
  );
}
