"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import {
  articleLinkThumbParts,
  googleFaviconUrl,
} from "./scrapbookHelpers";
import type { MemorialScrapbookTheme } from "./types";

const DASHBOARD_NAV_LINK_BLUE = "#2563eb";

type Props = {
  externalUrl: string;
  thumbnailUrl: string;
  caption: string | null;
  t: MemorialScrapbookTheme;
};

type ViewMode = "checking" | "iframe" | "fallback";

export function ArticleStageEmbed({ externalUrl, thumbnailUrl, caption, t }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("checking");
  const iframeFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { site } = articleLinkThumbParts(externalUrl);
  const fav = googleFaviconUrl(externalUrl);
  const cap = caption?.trim();

  useEffect(() => {
    let cancelled = false;

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
          body: JSON.stringify({ url: externalUrl }),
        });
        if (!res.ok) {
          if (!cancelled) setViewMode("iframe");
          return;
        }
        const json = (await res.json()) as { embeddable?: boolean };
        if (!cancelled) {
          setViewMode(json.embeddable === false ? "fallback" : "iframe");
        }
      } catch {
        if (!cancelled) setViewMode("iframe");
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [externalUrl]);

  useEffect(() => {
    if (viewMode !== "iframe") return;
    iframeFailTimerRef.current = setTimeout(() => setViewMode("fallback"), 8000);
    return () => {
      if (iframeFailTimerRef.current) {
        clearTimeout(iframeFailTimerRef.current);
        iframeFailTimerRef.current = null;
      }
    };
  }, [viewMode, externalUrl]);

  function clearIframeFallbackTimer() {
    if (iframeFailTimerRef.current) {
      clearTimeout(iframeFailTimerRef.current);
      iframeFailTimerRef.current = null;
    }
  }

  const squareFrame: CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    aspectRatio: "1 / 1",
    borderRadius: 10,
    overflow: "hidden",
    background: "#080808",
    position: "relative",
    display: "block",
    textDecoration: "none",
    color: "inherit",
  };

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

  if (viewMode === "checking") {
    if (thumbnailUrl) {
      return (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" style={squareFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </a>
      );
    }
    return (
      <div
        style={{
          ...embedFrame,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: t.textMuted,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Loading preview…
      </div>
    );
  }

  if (viewMode === "fallback") {
    if (thumbnailUrl) {
      return (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" style={squareFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          </a>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 14,
              color: DASHBOARD_NAV_LINK_BLUE,
              fontWeight: 700,
              textDecoration: "none",
              wordBreak: "break-all",
            }}
          >
            Open {site} ↗
          </a>
        </div>
      );
    }

    return (
      <a
        href={externalUrl}
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
        <img src={fav} alt="" width={48} height={48} style={{ borderRadius: 10, objectFit: "contain" }} />
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 6 }}>{site}</div>
          {cap ? (
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.45, marginBottom: 10 }}>{cap}</div>
          ) : null}
          <div style={{ fontSize: 13, color: t.textFaint, lineHeight: 1.4, marginBottom: 12 }}>
            This site does not allow an in-app preview. Tap to open the article in your browser.
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
            Open article ↗
          </span>
        </div>
      </a>
    );
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 10,
          justifyContent: "space-between",
          columnGap: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: t.textFaint, lineHeight: 1.45, flex: "1 1 200px" }}>
          Scroll inside the page below. Some sites block embedding—if it stays blank, use Open in new tab.
        </p>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 13,
            color: DASHBOARD_NAV_LINK_BLUE,
            fontWeight: 700,
            textDecoration: "none",
            flexShrink: 0,
            paddingTop: 1,
          }}
        >
          Open in new tab
        </a>
      </div>
      <div style={embedFrame}>
        <iframe
          src={externalUrl}
          title={site || "Linked article"}
          referrerPolicy="no-referrer-when-downgrade"
          loading="eager"
          onLoad={() => clearIframeFallbackTimer()}
          onError={() => setViewMode("fallback")}
          style={{ border: "none", width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </div>
  );
}
