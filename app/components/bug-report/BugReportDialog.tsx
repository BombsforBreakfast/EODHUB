"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import {
  BUG_REPORT_IMAGE_ACCEPT,
  bugReportImageExtension,
  validateBugReportImage,
} from "./shared";

export type BugReportDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function BugReportDialog({ open, onClose }: BugReportDialogProps) {
  const { t } = useTheme();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setScreenshotFile(null);
    revokePreview();
    setScreenshotPreview(null);
    setDone(false);
    setSubmitError(null);
    setScreenshotError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setScreenshotError(null);
    const file = e.target.files?.[0] ?? null;
    revokePreview();
    setScreenshotPreview(null);
    setScreenshotFile(null);
    if (!file) return;
    const err = validateBugReportImage(file);
    if (err) {
      setScreenshotError(err);
      e.target.value = "";
      return;
    }
    setScreenshotFile(file);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setScreenshotPreview(url);
  }

  function clearScreenshot() {
    setScreenshotError(null);
    setScreenshotFile(null);
    revokePreview();
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    return () => revokePreview();
  }, []);

  async function notifyAdminsPreview(summary: string, reporterId: string | null) {
    if (!reporterId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const { data: admins } = await supabase.from("profiles").select("user_id").eq("is_admin", true);
    const rows = (admins ?? []) as { user_id: string }[];
    if (rows.length === 0) return;
    await Promise.all(
      rows.map((a) =>
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            user_id: a.user_id,
            message: summary,
            type: "activity",
            actor_name: "A user",
          }),
        }),
      ),
    );
  }

  async function handleSubmit() {
    const desc = description.trim();
    if (!desc) return;
    setSubmitError(null);

    const { data: authUser } = await supabase.auth.getUser();
    const uid = authUser.user?.id ?? null;
    if (!uid) {
      setSubmitError("You must be signed in to send a bug report.");
      return;
    }

    setSubmitting(true);
    let screenshotUrl: string | null = null;

    try {
      if (screenshotFile) {
        const upErr = validateBugReportImage(screenshotFile);
        if (upErr) {
          setScreenshotError(upErr);
          setSubmitting(false);
          return;
        }
        setUploadingScreenshot(true);
        const ext = bugReportImageExtension(screenshotFile);
        const objectName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const path = `${uid}/${objectName}`;
        const { error: uploadErr } = await supabase.storage
          .from("bug-report-screenshots")
          .upload(path, screenshotFile, { upsert: false, contentType: screenshotFile.type || undefined });
        if (uploadErr) {
          throw new Error(uploadErr.message || "Screenshot upload failed.");
        }
        const { data: pub } = supabase.storage.from("bug-report-screenshots").getPublicUrl(path);
        screenshotUrl = pub.publicUrl;
      }

      const pageUrl = typeof window !== "undefined" ? window.location.href : null;
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
      const titleTrim = title.trim() || null;

      const { error: insertErr } = await supabase.from("bug_reports").insert({
        user_id: uid,
        title: titleTrim,
        description: desc,
        message: desc,
        page_url: pageUrl,
        user_agent: ua,
        screenshot_url: screenshotUrl,
        status: "new",
      });

      if (insertErr) throw new Error(insertErr.message);

      const preview = titleTrim ? `"${titleTrim.slice(0, 48)}${titleTrim.length > 48 ? "…" : ""}"` : desc.slice(0, 72) + (desc.length > 72 ? "…" : "");
      await notifyAdminsPreview(`Bug report submitted: ${preview}`, uid);

      setDone(true);
      window.setTimeout(() => handleClose(), 2800);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploadingScreenshot(false);
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const busy = submitting || uploadingScreenshot;
  const descOk = description.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          maxHeight: "min(90vh, 640px)",
          overflow: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          boxSizing: "border-box",
        }}
      >
        {done ? (
          <div style={{ textAlign: "center", padding: "36px 28px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, lineHeight: 1.5 }}>
              Bug report sent. Thanks for helping tighten up the Beta.
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 20px 12px",
                borderBottom: `1px solid ${t.border}`,
                position: "sticky",
                top: 0,
                background: t.surface,
                zIndex: 1,
              }}
            >
              <h2 id="bug-report-dialog-title" style={{ margin: 0, fontSize: 17, fontWeight: 900, color: t.text }}>
                Report a Bug
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => !busy && handleClose()}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  cursor: busy ? "not-allowed" : "pointer",
                  color: t.textMuted,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "18px 20px 22px", display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Short title <span style={{ fontWeight: 500, opacity: 0.85 }}>(optional)</span>
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Jobs filter resets"
                  disabled={busy}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1px solid ${t.inputBorder}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontSize: 14,
                    background: t.input,
                    color: t.text,
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Description <span style={{ color: "#f87171" }}>*</span>
                </span>
                <textarea
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect? Any steps to reproduce?"
                  disabled={busy}
                  rows={5}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1px solid ${t.inputBorder}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontSize: 14,
                    resize: "vertical",
                    minHeight: 120,
                    background: t.input,
                    color: t.text,
                    outline: "none",
                  }}
                />
              </label>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={BUG_REPORT_IMAGE_ACCEPT}
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                  Screenshot <span style={{ fontWeight: 500, opacity: 0.85 }}>(optional)</span>
                </div>
                {screenshotPreview ? (
                  <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      style={{
                        maxWidth: "100%",
                        maxHeight: 160,
                        borderRadius: 10,
                        display: "block",
                        border: `1px solid ${t.border}`,
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => !busy && clearScreenshot()}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.72)",
                        border: "none",
                        borderRadius: "50%",
                        width: 28,
                        height: 28,
                        color: "#fff",
                        fontWeight: 800,
                        cursor: busy ? "not-allowed" : "pointer",
                        fontSize: 15,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: `1px dashed ${t.border}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: t.textMuted,
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    + Add screenshot (PNG, JPG, WebP)
                  </button>
                )}
                {uploadingScreenshot ? (
                  <div style={{ marginTop: 10, fontSize: 13, color: t.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="btn-spinner" />
                    Uploading screenshot…
                  </div>
                ) : null}
                {screenshotError ? (
                  <div style={{ marginTop: 8, fontSize: 13, color: "#f87171", fontWeight: 600 }}>{screenshotError}</div>
                ) : null}
              </div>

              {submitError ? (
                <div
                  role="alert"
                  style={{
                    fontSize: 13,
                    color: "#fecaca",
                    background: "rgba(127,29,29,0.35)",
                    border: "1px solid rgba(248,113,113,0.45)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  {submitError}
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => !busy && handleClose()}
                  style={{
                    flex: "1 1 120px",
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: "transparent",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busy ? "not-allowed" : "pointer",
                    color: t.text,
                    opacity: busy ? 0.65 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !descOk}
                  onClick={() => void handleSubmit()}
                  style={{
                    flex: "2 1 180px",
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "#161616",
                    color: "#f5f5f5",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: busy || !descOk ? "not-allowed" : "pointer",
                    opacity: busy || !descOk ? 0.55 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {submitting && !uploadingScreenshot ? <span className="btn-spinner" /> : null}
                  Send report
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
