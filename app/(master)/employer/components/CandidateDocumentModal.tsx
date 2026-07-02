"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../../lib/ThemeContext";
import { useMasterShell } from "../../../components/master/masterShellContext";
import { candidateDisplayName } from "../lib/candidateUtils";
import type { PublicCandidate } from "../lib/types";
import { candidateDocumentApiHref } from "../lib/candidateDocumentLinks";
import { openDocumentLink } from "@/app/lib/native/nativeFileOpen";
import CandidateDocumentPreview from "./CandidateDocumentPreview";

type Props = {
  candidate: PublicCandidate;
  onClose: () => void;
};

type HostRect = { top: number; left: number; width: number; height: number };

function useViewportMobile() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return mobile;
}

function useCenterPaneRect(enabled: boolean): HostRect | null {
  const [rect, setRect] = useState<HostRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    function measure() {
      const main = document.querySelector(".master-shell-main");
      if (!main) {
        setRect(null);
        return;
      }
      const bounds = main.getBoundingClientRect();
      setRect({
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const main = document.querySelector(".master-shell-main");
    const observer = main ? new ResizeObserver(measure) : null;
    observer?.observe(main!);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  }, [enabled]);

  return rect;
}

export default function CandidateDocumentModal({ candidate, onClose }: Props) {
  const { t } = useTheme();
  const { isDesktopShell } = useMasterShell();
  const viewportMobile = useViewportMobile();
  const fullscreenViewport = !isDesktopShell || viewportMobile;
  const centerPaneRect = useCenterPaneRect(!fullscreenViewport);
  const name = candidateDisplayName(candidate);
  const downloadHref = useMemo(
    () => candidateDocumentApiHref(candidate.user_id, "resume", undefined, "download"),
    [candidate.user_id],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const overlayStyle: CSSProperties = fullscreenViewport
    ? {
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxSizing: "border-box",
      }
    : centerPaneRect
      ? {
          position: "fixed",
          top: centerPaneRect.top,
          left: centerPaneRect.left,
          width: centerPaneRect.width,
          height: centerPaneRect.height,
        }
      : {
          position: "fixed",
          inset: 0,
        };

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        ...overlayStyle,
        zIndex: 1200,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        overscrollBehavior: "contain",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} resume`}
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: t.surface,
          border: "none",
          borderRadius: 0,
          overflow: "hidden",
          color: t.text,
          boxShadow: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: fullscreenViewport ? "12px 14px" : "14px 16px",
            paddingLeft: fullscreenViewport
              ? "max(14px, env(safe-area-inset-left, 0px))"
              : "16px",
            paddingRight: fullscreenViewport
              ? "max(14px, env(safe-area-inset-right, 0px))"
              : "16px",
            borderBottom: `1px solid ${t.border}`,
            background: t.bg,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Resume
            </div>
            <div
              style={{
                fontSize: fullscreenViewport ? 17 : 18,
                fontWeight: 900,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
          </div>
          <a
            href={downloadHref}
            onClick={(event) => openDocumentLink(event, downloadHref)}
            style={{
              flexShrink: 0,
              color: t.textMuted,
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Save copy
          </a>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surface,
              color: t.text,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <CandidateDocumentPreview userId={candidate.user_id} kind="resume" minHeight={0} />
      </div>
    </div>,
    document.body,
  );
}
