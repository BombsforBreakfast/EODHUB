"use client";

import { useTheme } from "../../lib/ThemeContext";
import type { JobModalData } from "./JobDetailsModal";

type Size = "default" | "compact";

type Props = {
  job: JobModalData;
  onOpenDetails: (job: JobModalData) => void;
  saved: boolean;
  canSave: boolean;
  isTogglingSave: boolean;
  onToggleSave: (job: JobModalData) => void | Promise<void>;
  size?: Size;
};

function formatExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

/**
 * Shared footer for every job-card preview across the app:
 *
 *   [ Details ]        [ Visit site ]        [ Save / Saved ✓ ]
 *
 * Details opens the shared JobDetailsModal. Visit site is an external link.
 * Save toggles the saved_jobs row. Keeping this in one component guarantees
 * the same flow wherever a job card renders (home feed, /jobs, left rail,
 * saved sub-sections, etc.).
 */
export default function JobCardActions({
  job,
  onOpenDetails,
  saved,
  canSave,
  isTogglingSave,
  onToggleSave,
  size = "default",
}: Props) {
  const { t } = useTheme();
  const applyUrl = formatExternalUrl(job.apply_url);

  const isCompact = size === "compact";
  const pad = isCompact ? "4px 10px" : "6px 12px";
  const font = isCompact ? 12 : 13;
  const radius = isCompact ? 8 : 10;
  const gap = isCompact ? 6 : 8;

  const ghostStyle: React.CSSProperties = {
    background: "transparent",
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: radius,
    padding: pad,
    fontSize: font,
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1.1,
  };

  const visitStyle: React.CSSProperties = {
    ...ghostStyle,
    background: "#111",
    color: "white",
    border: "1px solid #111",
  };
  const visitDisabledStyle: React.CSSProperties = {
    ...ghostStyle,
    opacity: 0.4,
    cursor: "not-allowed",
  };

  const saveStyle: React.CSSProperties = {
    ...ghostStyle,
    background: saved ? "#111" : "transparent",
    color: saved ? "white" : t.text,
    border: `1px solid ${saved ? "#111" : t.border}`,
    cursor: !canSave || isTogglingSave ? "not-allowed" : "pointer",
    opacity: !canSave || isTogglingSave ? 0.6 : 1,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap,
        flexWrap: "wrap",
      }}
    >
      <button type="button" onClick={() => onOpenDetails(job)} style={ghostStyle}>
        Details
      </button>

      {applyUrl ? (
        <a href={applyUrl} target="_blank" rel="noreferrer" style={visitStyle}>
          Visit site
        </a>
      ) : (
        <span style={visitDisabledStyle} aria-disabled="true">
          No link
        </span>
      )}

      <button
        type="button"
        onClick={() => onToggleSave(job)}
        disabled={!canSave || isTogglingSave}
        title={canSave ? undefined : "Sign in to save jobs"}
        style={saveStyle}
      >
        {isTogglingSave ? "…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
