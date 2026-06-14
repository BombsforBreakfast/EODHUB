"use client";

import Image from "next/image";
import { useState } from "react";
import BugReportDialog from "./BugReportDialog";

const FAB_SIZE = 30;

export default function BetaBugReportFab() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <>
      <div
        className="beta-bug-report-fab"
        style={{
          position: "fixed",
          zIndex: 1050,
          right: "max(16px, env(safe-area-inset-right))",
          bottom: "max(20px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {(hover || open) && (
          <span
            style={{
              pointerEvents: "none",
              fontSize: 12,
              fontWeight: 800,
              color: "#fafafa",
              background: "rgba(12,12,14,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 6px 22px rgba(0,0,0,0.45)",
              padding: "6px 14px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            Report a bug
          </span>
        )}
        <button
          type="button"
          title="Report a bug"
          aria-label="Report a bug"
          onClick={() => setOpen(true)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          style={{
            pointerEvents: "auto",
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: "50%",
            padding: 0,
            border: "none",
            overflow: "hidden",
            cursor: "pointer",
            display: "block",
            lineHeight: 0,
            /* Readable on light + dark pages */
            boxShadow:
              "0 6px 26px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.35), 0 0 0 3px rgba(0,0,0,0.18)",
            transition: "transform 0.15s, box-shadow 0.15s",
            background: "transparent",
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "scale(0.96)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Image
            src="/images/bug-report-bomb.png"
            alt=""
            width={FAB_SIZE}
            height={FAB_SIZE}
            sizes={`${FAB_SIZE}px`}
            style={{
              display: "block",
              width: FAB_SIZE,
              height: FAB_SIZE,
              objectFit: "cover",
            }}
          />
        </button>
      </div>

      <BugReportDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
