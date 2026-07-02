"use client";

import { useEffect, useState } from "react";
import { isPortraitViewport } from "../../games/usePortraitRotateGate";
import { scrapbookHttpsUrl } from "./scrapbookHelpers";

function usePortraitOrientation(): boolean {
  const [portrait, setPortrait] = useState(
    () => typeof window !== "undefined" && isPortraitViewport(),
  );

  useEffect(() => {
    const sync = () => setPortrait(isPortraitViewport());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      vv?.removeEventListener("resize", sync);
    };
  }, []);

  return portrait;
}

function useImageIsLandscape(fileUrl: string | null | undefined): boolean | null {
  const [landscape, setLandscape] = useState<boolean | null>(null);

  useEffect(() => {
    const url = scrapbookHttpsUrl(fileUrl);
    if (!url) {
      setLandscape(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setLandscape(img.naturalWidth > img.naturalHeight);
      }
    };
    img.onerror = () => {
      if (!cancelled) setLandscape(null);
    };
    img.src = url;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [fileUrl]);

  return landscape;
}

type Props = {
  fileUrl: string | null | undefined;
};

/** Subtle rotate-phone hint for landscape photos viewed in portrait on mobile. */
export function LandscapeRotateHint({ fileUrl }: Props) {
  const portrait = usePortraitOrientation();
  const isLandscapePhoto = useImageIsLandscape(fileUrl);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [fileUrl]);

  useEffect(() => {
    if (!portrait) setDismissed(true);
  }, [portrait]);

  const show = portrait && isLandscapePhoto === true && !dismissed;

  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(() => setDismissed(true), 4500);
    return () => window.clearTimeout(timer);
  }, [show, fileUrl]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Rotate your phone sideways for a larger view"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "16px 20px",
          borderRadius: 16,
          background: "rgba(0,0,0,0.52)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
          maxWidth: "min(240px, 72vw)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="game-rotate-prompt-phone" aria-hidden style={{ fontSize: 36 }}>
            📱
          </span>
          <span className="game-rotate-prompt-arrow" aria-hidden style={{ fontSize: 24 }}>
            ↻
          </span>
        </div>
        <span
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            lineHeight: 1.3,
            textAlign: "center",
            textShadow: "0 1px 3px rgba(0,0,0,0.85)",
          }}
        >
          Rotate phone for fullscreen
        </span>
      </div>
    </div>
  );
}
