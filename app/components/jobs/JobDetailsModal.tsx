"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTheme } from "../../lib/ThemeContext";

export type JobModalData = {
  id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
  created_at?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_site_name?: string | null;
};

type Props = {
  job: JobModalData | null;
  open: boolean;
  onClose: () => void;
  saved: boolean;
  canSave: boolean;
  isTogglingSave: boolean;
  onToggleSave: (job: JobModalData) => void | Promise<void>;
};

function formatExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

export default function JobDetailsModal({
  job,
  open,
  onClose,
  saved,
  canSave,
  isTogglingSave,
  onToggleSave,
}: Props) {
  const { t } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !job) return null;

  const title = job.title || job.og_title || "Untitled Job";
  const company = job.company_name || job.og_site_name || "Unknown Company";
  const description = job.description || job.og_description || "";
  const applyUrl = formatExternalUrl(job.apply_url);
  const metaParts: string[] = [];
  if (job.location) metaParts.push(job.location);
  if (job.category) metaParts.push(job.category);
  const meta = metaParts.join(" · ");
  const payText =
    job.pay_min != null && job.pay_max != null
      ? `$${job.pay_min}–$${job.pay_max}`
      : job.pay_min != null
        ? `From $${job.pay_min}`
        : job.pay_max != null
          ? `Up to $${job.pay_max}`
          : null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10080,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "calc(100vh - 32px)",
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 20px 8px", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="job-modal-title" style={{ margin: 0, fontSize: 22, fontWeight: 900, color: t.text, lineHeight: 1.25 }}>
              {title}
            </h2>
            <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: t.text }}>{company}</div>
            {meta && (
              <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>{meta}</div>
            )}
            {(payText || job.clearance) && (
              <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>
                {payText ? `Pay: ${payText}` : ""}
                {payText && job.clearance ? " · " : ""}
                {job.clearance ? `Clearance: ${job.clearance}` : ""}
              </div>
            )}
            {job.source_type && (
              <div style={{ marginTop: 4, fontSize: 12, color: t.textFaint }}>Source: {job.source_type}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close job details"
            style={{
              flex: "0 0 auto",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        {job.og_image && (
          <img
            src={job.og_image}
            alt={title}
            style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block", borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}
          />
        )}

        <div style={{ padding: "14px 20px 4px", overflowY: "auto", flex: 1, minHeight: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: t.text }}>Job Description</h3>
          <div
            style={{
              marginTop: 8,
              fontSize: 14,
              lineHeight: 1.6,
              color: t.text,
              whiteSpace: "pre-wrap",
            }}
          >
            {description.trim().length > 0 ? description : "No description available. Use “Visit site” to view the full listing at the source."}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 20px 16px",
            borderTop: `1px solid ${t.border}`,
            background: t.surface,
            flexWrap: "wrap",
          }}
        >
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#111",
                color: "white",
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 800,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Visit site →
            </a>
          ) : (
            <span style={{ fontSize: 13, color: t.textFaint }}>No external link for this listing.</span>
          )}
          <button
            type="button"
            onClick={() => onToggleSave(job)}
            disabled={!canSave || isTogglingSave}
            title={canSave ? undefined : "Sign in to save jobs"}
            style={{
              background: saved ? "#111" : t.surface,
              color: saved ? "white" : t.text,
              border: `1px solid ${saved ? "#111" : t.border}`,
              borderRadius: 10,
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: 13,
              cursor: !canSave || isTogglingSave ? "not-allowed" : "pointer",
              opacity: !canSave || isTogglingSave ? 0.6 : 1,
            }}
          >
            {isTogglingSave ? "…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
