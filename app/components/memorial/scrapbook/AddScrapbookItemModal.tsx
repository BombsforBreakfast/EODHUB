"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemType } from "./types";

const SUCCESS_MSG_REVIEW =
  "Thanks for contributing. Your scrapbook item has been submitted for admin review.";
const SUCCESS_MSG_PUBLISHED = "Your scrapbook item has been published.";

type Props = {
  open: boolean;
  memorialId: string;
  onClose: () => void;
  onSubmitted: () => void;
  t: MemorialScrapbookTheme;
  accentColor: string;
};

export function AddScrapbookItemModal({ open, memorialId, onClose, onSubmitted, t, accentColor }: Props) {
  const [itemType, setItemType] = useState<ScrapbookItemType>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [articleThumb, setArticleThumb] = useState<string | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const [memoryBody, setMemoryBody] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState(SUCCESS_MSG_REVIEW);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function resetForm() {
    setItemType("photo");
    setFile(null);
    setExternalUrl("");
    setArticleThumb(null);
    setMemoryBody("");
    setCaption("");
    setLocation("");
    setEventDate("");
    setConfirmed(false);
    setError(null);
    setSuccess(false);
    setSuccessMessage(SUCCESS_MSG_REVIEW);
  }

  function close() {
    resetForm();
    onClose();
  }

  async function fetchArticlePreview() {
    setFetchingOg(true);
    setError(null);
    setArticleThumb(null);
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
      setArticleThumb(typeof json.image === "string" ? json.image : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setFetchingOg(false);
    }
  }

  async function uploadFile(f: File, uid: string): Promise<string> {
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${memorialId}/${uid}/${crypto.randomUUID()}.${safeExt}`;
    const { error: upErr } = await supabase.storage.from("memorial-scrapbook").upload(path, f, {
      upsert: false,
      contentType: f.type || undefined,
    });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from("memorial-scrapbook").getPublicUrl(path);
    return data.publicUrl;
  }

  async function submit() {
    setError(null);
    if (!confirmed) {
      setError("Please confirm the content is respectful and appropriate.");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      window.location.href = "/login";
      return;
    }

    const { data: profileRow } = await supabase.from("profiles").select("is_admin").eq("user_id", uid).maybeSingle();
    const isAdminContributor = Boolean((profileRow as { is_admin?: boolean | null } | null)?.is_admin);

    setSubmitting(true);
    try {
      let fileUrl: string | null = null;
      let extUrl: string | null = null;
      let thumb: string | null = null;
      let memBody: string | null = null;
      let cap = caption.trim() || null;

      if (itemType === "photo" || itemType === "document") {
        if (!file) {
          setError("Please choose a file to upload.");
          return;
        }
        fileUrl = await uploadFile(file, uid);
      } else if (itemType === "article") {
        if (!externalUrl.trim()) {
          setError("Please enter a website URL.");
          return;
        }
        extUrl = externalUrl.trim();
        thumb = articleThumb;
      } else {
        memBody = memoryBody.trim() || null;
        if (!memBody && !cap) {
          setError("Please enter your memory or a short caption.");
          return;
        }
      }

      const row = {
        memorial_id: memorialId,
        user_id: uid,
        item_type: itemType,
        file_url: fileUrl,
        external_url: extUrl,
        thumbnail_url: thumb,
        memory_body: memBody,
        caption: cap,
        location: itemType === "photo" ? (location.trim() || null) : null,
        event_date: itemType === "photo" ? (eventDate.trim() || null) : null,
        status: (isAdminContributor ? "approved" : "pending") as "pending" | "approved",
      };

      const { error: insErr } = await supabase.from("memorial_scrapbook_items").insert(row);
      if (insErr) throw new Error(insErr.message);

      setSuccessMessage(isAdminContributor ? SUCCESS_MSG_PUBLISHED : SUCCESS_MSG_REVIEW);
      setSuccess(true);
      onSubmitted();
      setTimeout(() => {
        close();
      }, 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={() => !submitting && !success && close()}
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
        aria-labelledby="scrapbook-add-title"
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
        <div id="scrapbook-add-title" style={{ fontSize: 17, fontWeight: 800 }}>
          Add to scrapbook
        </div>
        {success ? (
          <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.55, color: t.textMuted }}>{successMessage}</p>
        ) : (
          <>
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>Item type</div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["photo", "Photo"],
                  ["article", "Article / link"],
                  ["document", "Document"],
                  ["memory", "Memory"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setItemType(v);
                    setFile(null);
                    setError(null);
                    if (v !== "photo") {
                      setLocation("");
                      setEventDate("");
                    }
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${itemType === v ? accentColor : t.border}`,
                    background: itemType === v ? `${accentColor}22` : t.surfaceHover,
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 12,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {(itemType === "photo" || itemType === "document") && (
              <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                {itemType === "photo" ? "Choose photo" : "Choose file"}
                <input
                  type="file"
                  accept={itemType === "photo" ? "image/*" : "image/*,.pdf,.doc,.docx"}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ display: "block", marginTop: 6, fontSize: 13, color: t.text }}
                />
              </label>
            )}

            {itemType === "article" && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Website
                  <input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://…"
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      boxSizing: "border-box",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
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
                  {fetchingOg ? "Loading preview…" : "Load link preview"}
                </button>
                {articleThumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={articleThumb}
                    alt=""
                    style={{ marginTop: 10, maxWidth: "100%", borderRadius: 10, border: `1px solid ${t.border}` }}
                  />
                )}
              </div>
            )}

            {itemType === "memory" && (
              <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Your memory or story
                <textarea
                  value={memoryBody}
                  onChange={(e) => setMemoryBody(e.target.value)}
                  rows={5}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: 10,
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </label>
            )}

            {itemType === "photo" && (
              <>
                <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Caption (optional)
                  <input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      boxSizing: "border-box",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
                </label>
                <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Location (optional)
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      boxSizing: "border-box",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
                </label>
                <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Date of photo (approx) (optional)
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      boxSizing: "border-box",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
                </label>
              </>
            )}

            {(itemType === "document" || itemType === "article") && (
              <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Caption / context (optional)
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: "10px 12px",
                    fontSize: 14,
                  }}
                />
              </label>
            )}

            {itemType === "memory" && (
              <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Caption / context (optional)
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: "10px 12px",
                    fontSize: 14,
                  }}
                />
              </label>
            )}

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginTop: 16,
                fontSize: 13,
                cursor: "pointer",
                color: t.text,
              }}
            >
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I confirm this content is respectful, relevant, and appropriate for this memorial.</span>
            </label>

            {error && <div style={{ marginTop: 10, fontSize: 13, color: "#f87171", fontWeight: 600 }}>{error}</div>}

            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => close()}
                disabled={submitting}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: t.surfaceHover,
                  color: t.text,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "8px 14px",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                style={{
                  borderRadius: 10,
                  border: "none",
                  background: accentColor,
                  color: "white",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "8px 14px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.8 : 1,
                }}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
