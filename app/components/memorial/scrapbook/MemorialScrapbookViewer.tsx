"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemWithAuthor } from "./types";
import { ScrapbookItemCard } from "./ScrapbookItemCard";
import { scrapbookItemCaption, scrapbookThumbKindLabel } from "./scrapbookHelpers";
import { useScrapbookCompact } from "./useScrapbookCompact";
import { LandscapeRotateHint } from "./LandscapeRotateHint";

type Props = {
  open: boolean;
  items: ScrapbookItemWithAuthor[];
  initialIndex: number;
  onClose: () => void;
  onFlag: (itemId: string) => void;
  t: MemorialScrapbookTheme;
  accentColor: string;
  isMobile?: boolean;
  canManageItem: (item: ScrapbookItemWithAuthor) => boolean;
  onEditItem: (item: ScrapbookItemWithAuthor) => void;
  onDeleteItem: (item: ScrapbookItemWithAuthor) => void;
};

function ViewerThumbStrip({
  items,
  indexSafe,
  accentColor,
  t,
  onSelect,
  compactOverlay,
}: {
  items: ScrapbookItemWithAuthor[];
  indexSafe: number;
  accentColor: string;
  t: MemorialScrapbookTheme;
  onSelect: (index: number) => void;
  compactOverlay?: boolean;
}) {
  const n = items.length;

  return (
    <div
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "contain",
        touchAction: "pan-x",
        ...(compactOverlay
          ? { paddingBottom: 2 }
          : {
              padding: "10px 12px",
              paddingBottom: `max(10px, env(safe-area-inset-bottom))`,
              paddingLeft: `max(12px, env(safe-area-inset-left))`,
              paddingRight: `max(12px, env(safe-area-inset-right))`,
              borderTop: `1px solid ${t.border}`,
              flexShrink: 0,
              background: t.surfaceHover,
            }),
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          paddingBottom: 2,
          alignItems: "flex-start",
          justifyContent: compactOverlay ? "center" : undefined,
        }}
      >
        {items.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              flexShrink: 0,
              maxWidth: compactOverlay ? 64 : 76,
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(i)}
              title={`${scrapbookThumbKindLabel(it)} · ${i + 1} of ${n}`}
              style={{
                width: compactOverlay ? 52 : 56,
                height: compactOverlay ? 52 : 56,
                padding: 0,
                borderRadius: 8,
                overflow: "hidden",
                border: i === indexSafe ? `2px solid ${accentColor}` : compactOverlay ? "2px solid rgba(255,255,255,0.35)" : `1px solid ${t.border}`,
                cursor: "pointer",
                background: compactOverlay ? "rgba(0,0,0,0.35)" : t.badgeBg,
                boxShadow: compactOverlay ? "0 2px 8px rgba(0,0,0,0.45)" : undefined,
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
            {!compactOverlay && (
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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemorialScrapbookViewer({
  open,
  items,
  initialIndex,
  onClose,
  onFlag,
  t,
  accentColor,
  isMobile,
  canManageItem,
  onEditItem,
  onDeleteItem,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [actionsOpen, setActionsOpen] = useState(false);
  const compact = useScrapbookCompact(isMobile);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- align viewer index when opening from strip
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)));
    setActionsOpen(false);
  }, [open, initialIndex, items.length]);

  const n = items.length;
  const indexSafe = Math.min(Math.max(0, index), Math.max(0, n - 1));
  const current = n > 0 ? items[indexSafe] : null;
  const caption = current ? scrapbookItemCaption(current) : "";

  useEffect(() => {
    if (!open || n === 0) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, n]);

  const goPrev = useCallback(() => {
    setIndex((i) => {
      const safe = Math.min(Math.max(0, i), Math.max(0, n - 1));
      return safe <= 0 ? Math.max(0, n - 1) : safe - 1;
    });
  }, [n]);

  const goNext = useCallback(() => {
    setIndex((i) => {
      const safe = Math.min(Math.max(0, i), Math.max(0, n - 1));
      return safe >= Math.max(0, n - 1) ? 0 : safe + 1;
    });
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

  if (compact) {
    const overlayCaption =
      current && current.item_type === "memory"
        ? (current.caption?.trim() &&
          current.caption.trim() !== (current.memory_body?.trim() ?? "")
            ? current.caption.trim()
            : "")
        : caption;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scrapbook viewer"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          background: "#000",
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {current && (
            <ScrapbookItemCard key={current.id} item={current} t={t} accentColor={accentColor} variant="immersive" />
          )}
          {current?.item_type === "photo" && current.file_url && (
            <LandscapeRotateHint fileUrl={current.file_url} />
          )}
        </div>

        {n > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={goPrev}
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: 48,
                height: 88,
                border: "none",
                borderRadius: "0 10px 10px 0",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                fontSize: 32,
                fontWeight: 300,
                lineHeight: 1,
                cursor: "pointer",
                zIndex: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingLeft: 4,
              }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={goNext}
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                width: 48,
                height: 88,
                border: "none",
                borderRadius: "10px 0 0 10px",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                fontSize: 32,
                fontWeight: 300,
                lineHeight: 1,
                cursor: "pointer",
                zIndex: 3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingRight: 4,
              }}
            >
              ›
            </button>
          </>
        )}

        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "max(10px, env(safe-area-inset-top))",
            right: "max(10px, env(safe-area-inset-right))",
            width: 44,
            height: 44,
            border: "none",
            borderRadius: 10,
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 28,
            lineHeight: 1,
            cursor: "pointer",
            zIndex: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>

        {current && (
          <div style={{ position: "absolute", top: "max(10px, env(safe-area-inset-top))", left: "max(10px, env(safe-area-inset-left))", zIndex: 4 }}>
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((v) => !v)}
              style={{
                width: 44,
                height: 44,
                border: "none",
                borderRadius: 10,
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ⋯
            </button>
            {actionsOpen && (
              <div
                style={{
                  marginTop: 8,
                  minWidth: 168,
                  borderRadius: 12,
                  background: "rgba(0,0,0,0.82)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: 6,
                  display: "grid",
                  gap: 4,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    onFlag(current.id);
                  }}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    background: "transparent",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "10px 12px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  Flag / report
                </button>
                {canManageItem(current) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onEditItem(current);
                    }}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      background: "transparent",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                )}
                {canManageItem(current) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionsOpen(false);
                      onDeleteItem(current);
                    }}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      background: "transparent",
                      color: "#fca5a5",
                      fontWeight: 700,
                      fontSize: 13,
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 3,
            pointerEvents: "none",
            background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 45%, transparent 100%)",
            paddingTop: 56,
            paddingBottom: "max(10px, env(safe-area-inset-bottom))",
            paddingLeft: "max(10px, env(safe-area-inset-left))",
            paddingRight: "max(10px, env(safe-area-inset-right))",
          }}
        >
          {overlayCaption && (
            <p
              style={{
                margin: "0 0 12px",
                padding: "0 8px",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                lineHeight: 1.35,
                textAlign: "center",
                textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                pointerEvents: "none",
              }}
            >
              {overlayCaption}
            </p>
          )}
          <div style={{ pointerEvents: "auto" }}>
            <ViewerThumbStrip
              items={items}
              indexSafe={indexSafe}
              accentColor={accentColor}
              t={t}
              onSelect={setIndex}
              compactOverlay
            />
          </div>
        </div>
      </div>
    );
  }

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
        padding: 20,
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
          maxHeight: "calc(100vh - 48px)",
          background: t.surface,
          color: t.text,
          borderRadius: 16,
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
            padding: "14px 16px",
            paddingLeft: `max(16px, env(safe-area-inset-left))`,
            paddingRight: `max(16px, env(safe-area-inset-right))`,
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: t.textMuted }}>
            {indexSafe + 1} of {n}
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
            padding: "16px 18px",
            paddingLeft: `max(18px, env(safe-area-inset-left))`,
            paddingRight: `max(18px, env(safe-area-inset-right))`,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
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

          {current && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                flexDirection: "row",
                alignItems: "center",
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
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => onFlag(current.id)}
                  style={{
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
                {canManageItem(current) && (
                  <button
                    type="button"
                    onClick={() => onEditItem(current)}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      fontWeight: 700,
                      fontSize: 12,
                      padding: "10px 14px",
                      minHeight: 44,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                )}
                {canManageItem(current) && (
                  <button
                    type="button"
                    onClick={() => onDeleteItem(current)}
                    style={{
                      borderRadius: 10,
                      border: "none",
                      background: "#ef4444",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 12,
                      padding: "10px 14px",
                      minHeight: 44,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <ViewerThumbStrip
          items={items}
          indexSafe={indexSafe}
          accentColor={accentColor}
          t={t}
          onSelect={setIndex}
        />
      </div>
    </div>
  );
}
