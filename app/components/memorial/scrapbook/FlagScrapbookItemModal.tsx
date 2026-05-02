"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import type { MemorialScrapbookTheme } from "./types";
import { FLAG_REASON_OPTIONS, type ScrapbookFlagReason } from "./types";

type Props = {
  open: boolean;
  itemId: string | null;
  onClose: () => void;
  onSubmitted: () => void;
  t: MemorialScrapbookTheme;
  accentColor: string;
};

export function FlagScrapbookItemModal({ open, itemId, onClose, onSubmitted, t, accentColor }: Props) {
  const [reason, setReason] = useState<ScrapbookFlagReason>("inappropriate");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !itemId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, itemId]);

  if (!open || !itemId) return null;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        window.location.href = "/login";
        return;
      }
      const { error: insErr } = await supabase.from("memorial_scrapbook_flags").insert({
        scrapbook_item_id: itemId,
        user_id: uid,
        reason,
        details: details.trim() || null,
      });
      if (insErr) {
        if (insErr.code === "23505" || insErr.message.toLowerCase().includes("unique")) {
          setError("You have already flagged this item.");
        } else {
          setError(insErr.message);
        }
        return;
      }
      onSubmitted();
      setDetails("");
      setReason("inappropriate");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        boxSizing: "border-box",
        touchAction: "none",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scrapbook-flag-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          maxHeight: "min(85dvh, calc(100svh - max(32px, env(safe-area-inset-top)) - max(32px, env(safe-area-inset-bottom))))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: t.surface,
          color: t.text,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
          padding: "20px 22px",
          touchAction: "auto",
        }}
      >
        <div id="scrapbook-flag-title" style={{ fontSize: 17, fontWeight: 800 }}>
          Report scrapbook item
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          Tell us what is wrong. Items reported by multiple community members may be hidden until an admin reviews them.
        </p>
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {FLAG_REASON_OPTIONS.map((o) => (
            <label
              key={o.value}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontSize: 13,
                cursor: "pointer",
                color: t.text,
              }}
            >
              <input
                type="radio"
                name="scrapbook-flag-reason"
                checked={reason === o.value}
                onChange={() => setReason(o.value)}
                style={{ marginTop: 2 }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
          Optional details
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              marginTop: 6,
              boxSizing: "border-box",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surfaceHover,
              color: t.text,
              padding: 10,
              fontSize: 13,
              resize: "vertical",
            }}
          />
        </label>
        {error && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#f87171", fontWeight: 600 }}>{error}</div>
        )}
        <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surfaceHover,
              color: t.text,
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            style={{
              borderRadius: 10,
              border: "none",
              background: accentColor,
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saving ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
