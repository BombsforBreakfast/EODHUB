"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";

export default function ReportProblemButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t, isDark } = useTheme();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setScreenshotFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setScreenshotPreview(url);
    } else {
      setScreenshotPreview(null);
    }
  }

  function handleClose() {
    setOpen(false);
    setMessage("");
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setDone(false);
  }

  async function handleSubmit() {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      let screenshotUrl: string | null = null;

      if (screenshotFile && userId) {
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${screenshotFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("feed-images")
          .upload(`bug-reports/${safeName}`, screenshotFile, { upsert: false });
        if (!uploadErr) {
          const { data } = supabase.storage.from("feed-images").getPublicUrl(`bug-reports/${safeName}`);
          screenshotUrl = data.publicUrl;
        }
      }

      const { error: insertErr } = await supabase.from("bug_reports").insert([{
        user_id: userId ?? null,
        message: message.trim(),
        screenshot_url: screenshotUrl,
        page_url: window.location.href,
      }]);
      if (insertErr) throw new Error(insertErr.message);

      // Notify all admins
      const { data: admins } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("is_admin", true);
      if (admins && admins.length > 0 && userId) {
        await supabase.from("notifications").insert(
          admins.map((a: { user_id: string }) => ({
            user_id: a.user_id,
            actor_id: userId,
            actor_name: "A user",
            type: "activity",
            message: `Bug report submitted: "${message.trim().slice(0, 60)}${message.trim().length > 60 ? "..." : ""}"`,
            post_owner_id: null,
          }))
        );
      }

      setDone(true);
      setTimeout(() => handleClose(), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report a problem"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 400,
          background: isDark ? "#1e1e1e" : "#fff",
          border: `1px solid ${t.border}`,
          borderRadius: 999,
          padding: "8px 14px",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          color: t.textMuted,
          boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>⚑</span>
        Report
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            padding: "0 0 80px",
          }}
        >
          <div
            style={{
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
            }}
          >
            {done ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Thanks for the report!</div>
                <div style={{ fontSize: 14, color: t.textMuted, marginTop: 6 }}>We&apos;ll look into it shortly.</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontWeight: 900, fontSize: 17 }}>Report a Problem</div>
                  <button type="button" onClick={handleClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: t.textMuted, lineHeight: 1 }}>×</button>
                </div>

                <textarea
                  autoFocus
                  placeholder="Describe the issue — what happened, what you expected, what page you were on..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    border: `1px solid ${t.inputBorder}`, borderRadius: 10,
                    padding: "10px 12px", fontSize: 14, resize: "vertical",
                    background: t.input, color: t.text, outline: "none",
                  }}
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />

                {screenshotPreview ? (
                  <div style={{ marginTop: 12, position: "relative", display: "inline-block" }}>
                    <img src={screenshotPreview} alt="Screenshot" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 10, display: "block", border: `1px solid ${t.border}` }} />
                    <button type="button" onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ×
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    style={{ marginTop: 10, background: "transparent", border: `1px dashed ${t.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 13, color: t.textMuted, cursor: "pointer", width: "100%" }}>
                    + Attach Screenshot (optional)
                  </button>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button type="button" onClick={handleClose}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${t.border}`, background: "transparent", fontWeight: 700, fontSize: 14, cursor: "pointer", color: t.text }}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleSubmit}
                    disabled={submitting || !message.trim()}
                    style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 700, fontSize: 14, cursor: submitting || !message.trim() ? "not-allowed" : "pointer", opacity: submitting || !message.trim() ? 0.6 : 1 }}>
                    {submitting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
