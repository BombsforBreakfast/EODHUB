"use client";

import { useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import BugReportDialog from "./bug-report/BugReportDialog";

export default function ReportProblemButton({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const { t } = useTheme();

  return (
    <>
      {inline ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: "transparent",
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: "10px 16px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            color: t.text,
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden>
            ⚑
          </span>
          Report a Bug
        </button>
      ) : null}
      <BugReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
