"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemWithAuthor } from "./types";

type Props = {
  open: boolean;
  item: ScrapbookItemWithAuthor | null;
  onClose: () => void;
  onSaved: () => void;
  t: MemorialScrapbookTheme;
  accentColor: string;
};

export function EditScrapbookItemModal({ open, item, onClose, onSaved, t, accentColor }: Props) {
  const [caption, setCaption] = useState("");
  const [memoryBody, setMemoryBody] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [fetchingOg, setFetchingOg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setCaption(item.caption?.trim() ?? "");
    setMemoryBody(item.memory_body?.trim() ?? "");
    setExternalUrl(item.external_url?.trim() ?? "");
    setThumbnailUrl(item.thumbnail_url?.trim() ?? "");
    setLocation(item.location?.trim() ?? "");
    setEventDate(item.event_date?.trim() ? item.event_date.slice(0, 10) : "");
    setError(null);
  }, [open, item]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !item) return null;

  async function fetchArticlePreview() {
    setFetchingOg(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const res = await fetch("/api/memorial-scrapbook/link-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: externalUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load preview");
      setThumbnailUrl(typeof json.image === "string" ? json.image : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setFetchingOg(false);
    }
  }

  async function save() {
    if (!item) return;
    setError(null);
    if (item.item_type === "memory") {
      if (!memoryBody.trim() && !caption.trim()) {
        setError("Enter your memory text or a caption.");
        return;
      }
    }
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (item.item_type === "memory") {
        updates.memory_body = memoryBody.trim();
        updates.caption = caption.trim();
      } else if (item.item_type === "article") {
        if (!externalUrl.trim()) {
          setError("Article URL is required.");
          setSaving(false);
          return;
        }
        updates.external_url = externalUrl.trim();
        updates.caption = caption.trim();
        updates.thumbnail_url = thumbnailUrl.trim();
      } else if (item.item_type === "photo") {
        updates.caption = caption.trim();
        updates.location = location.trim();
        updates.event_date = eventDate.trim();
      } else if (item.item_type === "document") {
        updates.caption = caption.trim();
      }

      const { error: rpcErr } = await supabase.rpc("update_memorial_scrapbook_item", {
        p_item_id: item.id,
        p_updates: updates,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    display: "block" as const,
    width: "100%",
    marginTop: 6,
    boxSizing: "border-box" as const,
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.surfaceHover,
    color: t.text,
    padding: "10px 12px",
    fontSize: 14,
  };

  return (
    <div
      role="presentation"
      onClick={() => !saving && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1250,
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
        aria-labelledby="scrapbook-edit-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "min(90dvh, calc(100svh - max(32px, env(safe-area-inset-top)) - max(32px, env(safe-area-inset-bottom))))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: t.surface,
          color: t.text,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
          padding: "20px 22px 22px",
          touchAction: "auto",
        }}
      >
        <div id="scrapbook-edit-title" style={{ fontSize: 17, fontWeight: 800 }}>
          Edit scrapbook entry
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: t.textMuted, fontWeight: 700 }}>
          Type: <span style={{ color: t.text }}>{item.item_type}</span>
        </div>

        {item.item_type === "memory" && (
          <>
            <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Memory or story
              <textarea
                value={memoryBody}
                onChange={(e) => setMemoryBody(e.target.value)}
                rows={5}
                style={{ ...inputStyle, resize: "vertical" as const, minHeight: 100 }}
              />
            </label>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Short caption (optional)
              <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
            </label>
          </>
        )}

        {item.item_type === "article" && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Website URL
              <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
            </label>
            <button
              type="button"
              onClick={() => void fetchArticlePreview()}
              disabled={fetchingOg || !externalUrl.trim()}
              style={{
                marginTop: 8,
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.surfaceHover,
                color: t.text,
                fontWeight: 700,
                fontSize: 12,
                padding: "6px 12px",
                cursor: fetchingOg ? "not-allowed" : "pointer",
              }}
            >
              {fetchingOg ? "Loading preview…" : "Refresh link preview"}
            </button>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Thumbnail URL (optional)
              <input value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Caption (optional)
              <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
            </label>
          </div>
        )}

        {item.item_type === "photo" && (
          <>
            <p style={{ marginTop: 12, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              To replace the image itself, delete this entry and add a new photo.
            </p>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Caption (optional)
              <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Location (optional)
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Date of photo (optional)
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputStyle} />
            </label>
          </>
        )}

        {item.item_type === "document" && (
          <>
            <p style={{ marginTop: 12, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              To replace the file, delete this entry and upload a new document.
            </p>
            <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
              Caption (optional)
              <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
            </label>
          </>
        )}

        {error && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{error}</div>
        )}

        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surfaceHover,
              color: t.text,
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 16px",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              borderRadius: 10,
              border: "none",
              background: accentColor,
              color: "white",
              fontWeight: 800,
              fontSize: 13,
              padding: "10px 18px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
