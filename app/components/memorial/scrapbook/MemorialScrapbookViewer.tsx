"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemWithAuthor } from "./types";
import { ScrapbookItemCard } from "./ScrapbookItemCard";
import { scrapbookThumbKindLabel } from "./scrapbookHelpers";
import { useScrapbookCompact } from "./useScrapbookCompact";

type Props = {
  open: boolean;
  items: ScrapbookItemWithAuthor[];
  initialIndex: number;
  onClose: () => void;
  onFlag: (itemId: string) => void;
  t: MemorialScrapbookTheme;
  accentColor: string;
  isMobile?: boolean;
};

export function MemorialScrapbookViewer({
  open,
  items,
  initialIndex,
  onClose,
  onFlag,
  t,
  accentColor,
  isMobile,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const compact = useScrapbookCompact(isMobile);

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)));
  }, [open, initialIndex, items.length]);

  const n = items.length;
  const current = n > 0 ? items[index] : null;

  useEffect(() => {
    if (!open || n === 0) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, n]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? n - 1 : i - 1));
  }, [n]);

  const goNext = useCallback(() => {
    setIndex((i) => (i >= n - 1 ? 0 : i + 1));
  }, [n]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext]);

  if (!open || n === 0) return null;

  const navCircleBtn = {
    width: 44,
    height: 44,
    borderRadius: "50%" as const,
    border: `1px solid ${t.border}`,
    background: t.surfaceHover,
    color: t.text,
    fontSize: 20,
    cursor: "pointer" as const,
    flexShrink: 0,
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: compact
          ? "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))"
          : 20,
        boxSizing: "border-box",
        touchAction: "none",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scrapbook viewer"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: compact
            ? "min(92dvh, calc(100svh - max(24px, env(safe-area-inset-top)) - max(24px, env(safe-area-inset-bottom))))"
            : "calc(100vh - 48px)",
          background: t.surface,
          color: t.text,
          borderRadius: compact ? 12 : 16,
          border: `1px solid ${t.border}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          touchAction: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: compact ? "12px 14px" : "14px 16px",
            paddingLeft: `max(${compact ? 14 : 16}px, env(safe-area-inset-left))`,
            paddingRight: `max(${compact ? 14 : 16}px, env(safe-area-inset-right))`,
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: t.textMuted }}>
            {index + 1} of {n}
          </div>
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

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            padding: compact ? "12px 14px" : "16px 18px",
            paddingLeft: `max(${compact ? 14 : 18}px, env(safe-area-inset-left))`,
            paddingRight: `max(${compact ? 14 : 18}px, env(safe-area-inset-right))`,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {compact ? (
            <>
              <div style={{ width: "100%", minWidth: 0 }}>
                {current && (
                  <ScrapbookItemCard key={current.id} item={current} t={t} accentColor={accentColor} variant="stage" />
                )}
              </div>
              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button type="button" aria-label="Previous" onClick={goPrev} style={{ ...navCircleBtn, flex: 1, width: "auto", height: 48, borderRadius: 12 }}>
                  ‹
                </button>
                <button type="button" aria-label="Next" onClick={goNext} style={{ ...navCircleBtn, flex: 1, width: "auto", height: 48, borderRadius: 12 }}>
                  ›
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
              <button type="button" aria-label="Previous" onClick={goPrev} style={navCircleBtn}>
                ‹
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                {current && (
                  <ScrapbookItemCard key={current.id} item={current} t={t} accentColor={accentColor} variant="stage" />
                )}
              </div>
              <button type="button" aria-label="Next" onClick={goNext} style={navCircleBtn}>
                ›
              </button>
            </div>
          )}

          {current && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                flexDirection: compact ? "column" : "row",
                alignItems: compact ? "stretch" : "center",
                gap: 12,
                paddingTop: 4,
                borderTop: `1px solid ${t.borderLight}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: t.border,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 800,
                    color: t.text,
                  }}
                >
                  {current.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.authorPhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    current.authorName[0]?.toUpperCase() ?? "?"
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{current.authorName}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    {new Date(current.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onFlag(current.id)}
                style={{
                  marginLeft: compact ? 0 : "auto",
                  alignSelf: compact ? "stretch" : undefined,
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: "transparent",
                  color: t.textMuted,
                  fontWeight: 700,
                  fontSize: 12,
                  padding: "10px 14px",
                  minHeight: 44,
                  cursor: "pointer",
                }}
              >
                Flag / report
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            padding: "10px 12px",
            paddingBottom: `max(10px, env(safe-area-inset-bottom))`,
            paddingLeft: `max(12px, env(safe-area-inset-left))`,
            paddingRight: `max(12px, env(safe-area-inset-right))`,
            borderTop: `1px solid ${t.border}`,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain",
            touchAction: "pan-x",
            flexShrink: 0,
            background: t.surfaceHover,
          }}
        >
          <div style={{ display: "flex", gap: 10, paddingBottom: 2, alignItems: "flex-start" }}>
            {items.map((it, i) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  flexShrink: 0,
                  maxWidth: 76,
                }}
              >
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  title={`${scrapbookThumbKindLabel(it)} · ${i + 1} of ${n}`}
                  style={{
                    width: 56,
                    height: 56,
                    padding: 0,
                    borderRadius: 8,
                    overflow: "hidden",
                    border: i === index ? `2px solid ${accentColor}` : `1px solid ${t.border}`,
                    cursor: "pointer",
                    background: t.badgeBg,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transform: "scale(0.92)",
                    }}
                  >
                    <ScrapbookItemCard item={it} t={t} accentColor={accentColor} variant="thumb" />
                  </div>
                </button>
                <span
                  style={{
                    margin: 0,
                    padding: 0,
                    fontSize: 9,
                    fontWeight: 800,
                    color: t.textMuted,
                    textAlign: "center",
                    lineHeight: 1,
                    letterSpacing: "0.03em",
                    width: "100%",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    wordBreak: "break-word",
                  }}
                >
                  {scrapbookThumbKindLabel(it)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
