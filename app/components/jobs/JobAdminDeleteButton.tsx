"use client";

import { useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";

type Props = {
  jobId: string;
  onDeleted?: () => void;
  size?: "compact" | "default";
};

export default function JobAdminDeleteButton({ jobId, onDeleted, size = "default" }: Props) {
  const { t } = useTheme();
  const [deleting, setDeleting] = useState(false);
  const isCompact = size === "compact";

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Permanently delete this job posting? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/delete-job?id=${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) {
        let err: { error?: string } = {};
        try {
          err = await res.json();
        } catch {
          /* ignore */
        }
        window.alert(err.error ?? "Delete failed");
        return;
      }
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={deleting}
      title="Admin: permanently delete this job"
      style={{
        background: "transparent",
        color: "#dc2626",
        border: `1px solid ${t.border}`,
        borderRadius: isCompact ? 8 : 10,
        padding: isCompact ? "3px 8px" : "6px 12px",
        fontSize: isCompact ? 11 : 13,
        fontWeight: 700,
        cursor: deleting ? "not-allowed" : "pointer",
        opacity: deleting ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {deleting ? "…" : "Delete"}
    </button>
  );
}
