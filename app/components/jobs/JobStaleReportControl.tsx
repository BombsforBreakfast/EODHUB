"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";

export type StaleReason =
  | "dead_link"
  | "expired"
  | "position_filled"
  | "incorrect_info"
  | "other";

const STALE_REASON_OPTIONS: ReadonlyArray<{ id: StaleReason; label: string }> = [
  { id: "dead_link", label: "Link is broken / 404" },
  { id: "expired", label: "Posting has expired" },
  { id: "position_filled", label: "Position has been filled" },
  { id: "incorrect_info", label: "Details are wrong" },
  { id: "other", label: "Other (add a note)" },
];

type Variant = "inline" | "compact";

type Props = {
  jobId: string;
  variant?: Variant;
  /** Render style for the trigger pill when collapsed. */
  triggerLabel?: string;
};

/**
 * Shared "Report broken / expired listing" control. Used in JobDetailsModal
 * (inline variant under the description) and in compact form on job cards.
 *
 * Idempotent on the server side — repeat submissions for the same (job,
 * reporter) update the existing flag row instead of creating duplicates.
 */
export default function JobStaleReportControl({
  jobId,
  variant = "inline",
  triggerLabel = "Report broken link or expired listing",
}: Props) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<StaleReason>("dead_link");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [desktopPopoverStyle, setDesktopPopoverStyle] = useState<React.CSSProperties | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsNarrowViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Reset everything when the control switches to a different job (cards
  // recycle the component as the user scrolls).
  useEffect(() => {
    setOpen(false);
    setReason("dead_link");
    setNotes("");
    setSubmitting(false);
    setReportError(null);
    setReported(false);
  }, [jobId]);

  const POPOVER_WIDTH = 280;
  const POPOVER_GAP = 8;

  function updateDesktopPopoverPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const maxWidth = Math.min(POPOVER_WIDTH, window.innerWidth - viewportPadding * 2);

    let left = rect.right - maxWidth;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - maxWidth - viewportPadding));

    const panel = popoverPanelRef.current;
    const panelHeight = panel?.offsetHeight ?? 360;
    const spaceAbove = rect.top - viewportPadding;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const placeAbove = spaceAbove >= panelHeight + POPOVER_GAP || spaceAbove >= spaceBelow;

    if (placeAbove) {
      setDesktopPopoverStyle({
        position: "fixed",
        top: Math.max(viewportPadding, rect.top - POPOVER_GAP),
        left,
        width: maxWidth,
        transform: "translateY(-100%)",
        zIndex: 500,
        visibility: "visible",
      });
    } else {
      setDesktopPopoverStyle({
        position: "fixed",
        top: Math.min(window.innerHeight - viewportPadding, rect.bottom + POPOVER_GAP),
        left,
        width: maxWidth,
        zIndex: 500,
        visibility: "visible",
      });
    }
  }

  // Position the portaled desktop popover relative to the trigger (avoids card overflow clipping).
  useLayoutEffect(() => {
    if (variant !== "compact" || !open || isNarrowViewport) {
      setDesktopPopoverStyle(null);
      return;
    }

    const run = () => updateDesktopPopoverPosition();
    run();
    const raf = requestAnimationFrame(run);

    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run, true);
    };
  }, [variant, open, isNarrowViewport, reason, notes, reportError]);

  // Close compact popover on outside click (desktop popover only).
  useEffect(() => {
    if (variant !== "compact" || !open || isNarrowViewport) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverPanelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [variant, open, isNarrowViewport]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setReportError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setReportError("Please sign in again to report this listing.");
        return;
      }
      const res = await fetch(`/api/jobs/${jobId}/flag-stale`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setReportError(
          json.error === "Job not found."
            ? "This listing has been removed."
            : (json.error ?? `Report failed (${res.status})`),
        );
        return;
      }
      setReported(true);
      setOpen(false);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const triggerStyle: React.CSSProperties =
    variant === "compact"
      ? {
          background: "none",
          border: "none",
          padding: 0,
          color: t.textFaint,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          textDecoration: "underline",
          letterSpacing: 0.2,
        }
      : {
          background: "none",
          border: "none",
          padding: 0,
          color: t.textMuted,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          textDecoration: "underline",
        };

  const successText = "Thanks — sent to admins for review.";

  if (reported) {
    return (
      <span
        style={{
          color: "#15803d",
          fontSize: variant === "compact" ? 11 : 12,
          fontWeight: 700,
        }}
      >
        ✓ {successText}
      </span>
    );
  }

  const form = (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>
        Report this listing
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {STALE_REASON_OPTIONS.map((opt) => (
          <label
            key={opt.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: t.text,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={`job-stale-reason-${jobId}`}
              checked={reason === opt.id}
              onChange={() => setReason(opt.id)}
            />
            {opt.label}
          </label>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional — anything else admins should know."
        rows={2}
        maxLength={500}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${t.inputBorder ?? t.border}`,
          background: t.input ?? t.surface,
          color: t.text,
          fontSize: 13,
          resize: "vertical",
          minHeight: 50,
        }}
      />
      {reportError && (
        <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
          {reportError}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          style={{
            background: "#111",
            color: "white",
            border: "1px solid #111",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Sending…" : "Submit report"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReportError(null);
          }}
          disabled={submitting}
          style={{
            background: "transparent",
            color: t.text,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} style={triggerStyle}>
            {triggerLabel}
          </button>
        )}
        {open && form}
      </div>
    );
  }

  const popoverPanelStyle: React.CSSProperties = {
    background: t.surface,
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
  };

  // Compact variant — text trigger; bottom sheet on mobile, portaled popover on desktop.
  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={triggerStyle}
      >
        {triggerLabel}
      </button>
      {open &&
        !isNarrowViewport &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverPanelRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...popoverPanelStyle,
              ...(desktopPopoverStyle ?? {
                position: "fixed",
                top: -9999,
                left: -9999,
                width: POPOVER_WIDTH,
                zIndex: 500,
                visibility: "hidden" as const,
              }),
            }}
          >
            {form}
          </div>,
          document.body,
        )}
      {open &&
        isNarrowViewport &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Report this listing"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 500,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              padding: 12,
            }}
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 400,
                marginBottom: "max(12px, env(safe-area-inset-bottom))",
                ...popoverPanelStyle,
              }}
            >
              {form}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
