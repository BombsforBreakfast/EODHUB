"use client";

import { useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";

type Props = {
  jobId: string;
  underReview: boolean;
  onChanged?: (underReview: boolean) => void;
  size?: "compact" | "default";
};

export default function JobAdminApplicationsUnderReviewButton({
  jobId,
  underReview,
  onChanged,
  size = "default",
}: Props) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const isCompact = size === "compact";
  const nextValue = !underReview;

  async function handleToggle() {
    if (busy) return;
    const confirmMsg = nextValue
      ? "Mark this job as applications under review? It stays visible with a yellow badge for members."
      : "Clear applications under review and show this job as actively hiring again?";
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/jobs/applications-under-review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobId, underReview: nextValue }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        applications_under_review?: boolean;
      };
      if (!res.ok) {
        window.alert(json.error ?? "Update failed");
        return;
      }
      onChanged?.(json.applications_under_review === true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleToggle()}
      disabled={busy}
      title={
        underReview
          ? "Admin: clear applications under review"
          : "Admin: mark applications under review"
      }
      style={{
        background: underReview ? "#fef08a" : "transparent",
        color: underReview ? "#854d0e" : "#a16207",
        border: `1px solid ${underReview ? "#fde047" : t.border}`,
        borderRadius: isCompact ? 8 : 10,
        padding: isCompact ? "3px 8px" : "6px 12px",
        fontSize: isCompact ? 11 : 13,
        fontWeight: 700,
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {busy ? "…" : underReview ? "Clear review" : "Under review"}
    </button>
  );
}
