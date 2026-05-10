"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import {
  articleLinkThumbParts,
  scrapbookHttpsUrl,
  youtubeVideoIdFromUrl,
} from "@/app/components/memorial/scrapbook/scrapbookHelpers";

const DASHBOARD_NAV_LINK_BLUE = "#2563eb";

export type ExternalSiteEmbedModalProps = {
  open: boolean;
  onClose: () => void;
  url: string | null | undefined;
  /** Accessible name for the dialog */
  title?: string;
};

/**
 * In-app browser for external URLs (scrapbook article pattern: iframe + optional YouTube embed).
 * Keeps users inside EOD-HUB while still allowing “Open in new tab” when embedding is blocked.
 */
export function ExternalSiteEmbedModal({
  open,
  onClose,
  url,
  title = "External website",
}: ExternalSiteEmbedModalProps) {
  const { t } = useTheme();
  const normalized = scrapbookHttpsUrl(url ?? "");
  const ytId = normalized ? youtubeVideoIdFromUrl(normalized) : null;
  const { site } = normalized ? articleLinkThumbParts(normalized) : { site: "" };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !normalized) return null;

  const embedFrame: CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    margin: 0,
    height: "min(78dvh, 900px)",
    minHeight: "min(420px, 55dvh)",
    borderRadius: 10,
    overflow: "hidden",
    background: "#0a0a0a",
    border: `1px solid ${t.border}`,
    boxSizing: "border-box",
  };

  const squareFrame: CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    aspectRatio: "1 / 1",
    borderRadius: 10,
    overflow: "hidden",
    background: "#080808",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))",
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "min(92dvh, calc(100svh - 24px))",
          background: t.surface,
          color: t.text,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 14px",
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: t.textMuted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {site || "Website"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a
              href={normalized}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: DASHBOARD_NAV_LINK_BLUE,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open in new tab
            </a>
            <button
              type="button"
              aria-label="Close"
              title="Close (Esc)"
              onClick={onClose}
              style={{
                border: `1px solid ${t.border}`,
                background: t.surfaceHover,
                color: t.text,
                borderRadius: 10,
                padding: "4px 10px",
                fontWeight: 800,
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                minWidth: 44,
                minHeight: 44,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
            Scroll inside the page below. Some sites block embedding—if it stays blank, use Open in new tab.
          </p>
          {ytId ? (
            <div style={squareFrame}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?rel=0&playsinline=1`}
                title="YouTube video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ border: "none", width: "100%", height: "100%", display: "block" }}
              />
            </div>
          ) : (
            <div style={embedFrame}>
              <iframe
                src={normalized}
                title={site || "Linked page"}
                referrerPolicy="no-referrer-when-downgrade"
                loading="eager"
                style={{
                  border: "none",
                  width: "100%",
                  height: "100%",
                  display: "block",
                }}
              />
            </div>
          )}
          <a
            href={normalized}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              color: DASHBOARD_NAV_LINK_BLUE,
              wordBreak: "break-all",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {normalized}
          </a>
        </div>
      </div>
    </div>
  );
}

type LinkProps = {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
};

/**
 * Button styled like a link; opens {@link ExternalSiteEmbedModal} instead of navigating away.
 */
export function ExternalSiteLink({ href, children, style, ariaLabel }: LinkProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          cursor: "pointer",
          color: "inherit",
          ...style,
        }}
      >
        {children}
      </button>
      <ExternalSiteEmbedModal open={open} url={href} onClose={() => setOpen(false)} />
    </>
  );
}
