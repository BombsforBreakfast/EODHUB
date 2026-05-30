"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import {
  articleLinkThumbParts,
  googleFaviconUrl,
  scrapbookHttpsUrl,
  youtubeVideoIdFromUrl,
} from "@/app/components/memorial/scrapbook/scrapbookHelpers";
import { supabase } from "@/app/lib/lib/supabaseClient";

const DASHBOARD_NAV_LINK_BLUE = "#2563eb";

type ViewMode = "checking" | "iframe" | "fallback";

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
  const fav = normalized ? googleFaviconUrl(normalized) : "";
  const [viewMode, setViewMode] = useState<ViewMode>("checking");
  const iframeFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!open || !normalized || ytId) {
      setViewMode("iframe");
      return;
    }

    let cancelled = false;
    setViewMode("checking");

    async function check() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (!cancelled) setViewMode("fallback");
          return;
        }

        const res = await fetch("/api/memorial-scrapbook/embed-check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: normalized }),
        });

        if (!res.ok) {
          if (!cancelled) setViewMode("iframe");
          return;
        }

        const json = (await res.json()) as { embeddable?: boolean };
        if (!cancelled) setViewMode(json.embeddable === false ? "fallback" : "iframe");
      } catch {
        if (!cancelled) setViewMode("iframe");
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [open, normalized, ytId]);

  useEffect(() => {
    if (!open || viewMode !== "iframe" || ytId) return;
    iframeFailTimerRef.current = setTimeout(() => setViewMode("fallback"), 8000);
    return () => {
      if (iframeFailTimerRef.current) {
        clearTimeout(iframeFailTimerRef.current);
        iframeFailTimerRef.current = null;
      }
    };
  }, [open, viewMode, normalized, ytId]);

  function clearIframeFallbackTimer() {
    if (iframeFailTimerRef.current) {
      clearTimeout(iframeFailTimerRef.current);
      iframeFailTimerRef.current = null;
    }
  }

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
          {viewMode !== "fallback" ? (
            <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
              Scroll inside the page below. Some sites block embedding. If preview is unavailable, use Open in new tab.
            </p>
          ) : null}
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
          ) : viewMode === "checking" ? (
            <div
              style={{
                ...embedFrame,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: t.textMuted,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Checking in-app preview...
            </div>
          ) : viewMode === "fallback" ? (
            <a
              href={normalized}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                padding: "28px 20px",
                minHeight: "min(320px, 50dvh)",
                borderRadius: 12,
                border: `1px solid ${t.border}`,
                background: t.badgeBg,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {fav ? <img src={fav} alt="" width={48} height={48} style={{ borderRadius: 10, objectFit: "contain" }} /> : null}
              <div style={{ textAlign: "center", maxWidth: 420 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 6 }}>
                  {site || "Website"}
                </div>
                <div style={{ fontSize: 13, color: t.textFaint, lineHeight: 1.4, marginBottom: 12 }}>
                  This site does not allow an in-app preview. Tap to open it in your browser.
                </div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "10px 18px",
                    borderRadius: 10,
                    background: "#111",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Open website
                </span>
              </div>
            </a>
          ) : (
            <div style={embedFrame}>
              <iframe
                src={normalized}
                title={site || "Linked page"}
                referrerPolicy="no-referrer-when-downgrade"
                loading="eager"
                onLoad={clearIframeFallbackTimer}
                onError={() => setViewMode("fallback")}
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
