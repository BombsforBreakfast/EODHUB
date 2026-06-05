"use client";

import Link from "next/link";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../lib/ThemeContext";
import OptimizedAvatarImg from "./OptimizedAvatarImg";
import { getServiceRingColor } from "../lib/serviceBranchVisual";

export type PostLikerBrief = {
  userId: string;
  name: string;
  photoUrl: string | null;
  service: string | null;
  isEmployer: boolean | null;
};

export function LikerAvatar({
  photoUrl,
  name,
  size = 44,
  service,
  isEmployer,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
  service?: string | null;
  isEmployer?: boolean | null;
}) {
  const { t } = useTheme();
  const ringColor = isEmployer ? null : getServiceRingColor(service);
  const borderRadius = isEmployer ? Math.max(4, size * 0.18) : "50%";
  const bgColor = isEmployer ? "#f0f0f0" : t.badgeBg;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius,
        overflow: "hidden",
        background: bgColor,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: t.textMuted,
        fontSize: size * 0.32,
        boxSizing: "border-box",
        border: ringColor ? `${size <= 36 ? 3 : 4}px solid ${ringColor}` : undefined,
      }}
    >
      {photoUrl ? (
        <OptimizedAvatarImg photoUrl={photoUrl} displayName={name} sizePx={size} />
      ) : (
        (name?.trim()?.[0] || "U").toUpperCase()
      )}
    </div>
  );
}

const PEEK_LIKERS = 3;
/** Overlapping liker faces in the post action bar. */
const TOOLBAR_AVATAR_SIZE = 32;
const TOOLBAR_AVATAR_OVERLAP = -8;

function LikerPopoverList({
  likers,
  onNavigate,
}: {
  likers: PostLikerBrief[];
  onNavigate: () => void;
}) {
  const { t } = useTheme();

  return (
    <>
      {likers.map((liker) => (
        <Link
          key={liker.userId}
          href={`/profile/${liker.userId}`}
          role="menuitem"
          onClick={onNavigate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 8,
            textDecoration: "none",
            color: t.text,
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.badgeBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <LikerAvatar
            photoUrl={liker.photoUrl}
            name={liker.name}
            size={32}
            service={liker.service}
            isEmployer={liker.isEmployer}
          />
          <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{liker.name}</span>
        </Link>
      ))}
    </>
  );
}

function MobileLikersPopover({
  likers,
  peekLikers,
  showEllipsis,
  hiddenCount,
}: {
  likers: PostLikerBrief[];
  peekLikers: PostLikerBrief[];
  showEllipsis: boolean;
  hiddenCount: number;
}) {
  const { t } = useTheme();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!popoverOpen) {
      setPanelPosition(null);
      return;
    }

    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const viewportPad = 12;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;

    let left = triggerRect.left + triggerRect.width / 2 - panelWidth / 2;
    left = Math.max(viewportPad, Math.min(left, window.innerWidth - viewportPad - panelWidth));

    let top = triggerRect.top - gap - panelHeight;
    if (top < viewportPad) {
      top = triggerRect.bottom + gap;
    }

    setPanelPosition({ top, left });
  }, [popoverOpen, likers.length]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setPopoverOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [popoverOpen]);

  const panelChromeStyle: React.CSSProperties = {
    minWidth: 220,
    maxWidth: 320,
    maxHeight: "min(320px, 50vh)",
    overflowY: "auto",
    background: t.surface,
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
    padding: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    visibility: panelPosition ? "visible" : "hidden",
  };

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={popoverOpen}
        aria-haspopup="menu"
        aria-label={`${likers.length} reaction${likers.length === 1 ? "" : "s"}. Show who reacted.`}
        onClick={() => setPopoverOpen((open) => !open)}
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          borderRadius: 999,
        }}
      >
        {peekLikers.map((liker, i) => (
          <span
            key={liker.userId}
            style={{
              marginLeft: i === 0 ? 0 : TOOLBAR_AVATAR_OVERLAP,
              position: "relative",
              zIndex: peekLikers.length - i,
              lineHeight: 0,
              pointerEvents: "none",
            }}
          >
            <LikerAvatar
              photoUrl={liker.photoUrl}
              name={liker.name}
              size={TOOLBAR_AVATAR_SIZE}
              service={liker.service}
              isEmployer={liker.isEmployer}
            />
          </span>
        ))}
        {showEllipsis && (
          <span
            style={{
              marginLeft: 6,
              flexShrink: 0,
              background: t.bg,
              border: `1px solid ${t.borderLight}`,
              borderRadius: 999,
              minWidth: 28,
              height: TOOLBAR_AVATAR_SIZE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.textMuted,
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            +{hiddenCount}
          </span>
        )}
      </button>

      {popoverOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="People who reacted"
            style={{
              position: "fixed",
              top: panelPosition?.top ?? 0,
              left: panelPosition?.left ?? 0,
              zIndex: 10050,
              ...panelChromeStyle,
            }}
          >
            <LikerPopoverList likers={likers} onNavigate={() => setPopoverOpen(false)} />
          </div>,
          document.body,
        )}
    </div>
  );
}

export function PostLikersStack({ likers }: { likers: PostLikerBrief[] }) {
  const { t } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [prefersHover, setPrefersHover] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setPrefersHover(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  if (likers.length === 0) return null;

  const peekLikers = likers.slice(0, PEEK_LIKERS);
  const showEllipsis = likers.length > PEEK_LIKERS;
  const hiddenCount = Math.max(0, likers.length - peekLikers.length);

  if (!prefersHover) {
    return (
      <MobileLikersPopover
        likers={likers}
        peekLikers={peekLikers}
        showEllipsis={showEllipsis}
        hiddenCount={hiddenCount}
      />
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {peekLikers.map((liker, i) => (
          <Link
            key={liker.userId}
            href={`/profile/${liker.userId}`}
            title={liker.name}
            style={{
              marginLeft: i === 0 ? 0 : TOOLBAR_AVATAR_OVERLAP,
              position: "relative",
              zIndex: PEEK_LIKERS - i,
              textDecoration: "none",
              lineHeight: 0,
            }}
          >
            <LikerAvatar
              photoUrl={liker.photoUrl}
              name={liker.name}
              size={TOOLBAR_AVATAR_SIZE}
              service={liker.service}
              isEmployer={liker.isEmployer}
            />
          </Link>
        ))}
        {showEllipsis && (
          <button
            type="button"
            aria-label="Show everyone who liked this post"
            onClick={() => setModalOpen(true)}
            style={{
              marginLeft: 6,
              background: t.bg,
              border: `1px solid ${t.borderLight}`,
              borderRadius: 999,
              minWidth: 40,
              height: TOOLBAR_AVATAR_SIZE,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: t.textMuted,
              fontSize: 16,
              fontWeight: 800,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            …
          </button>
        )}
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="People who liked this post"
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.surface,
              borderRadius: 14,
              border: `1px solid ${t.border}`,
              maxWidth: 380,
              width: "100%",
              maxHeight: "min(72vh, 520px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                borderBottom: `1px solid ${t.border}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 16, color: t.text }}>
                Likes ({likers.length})
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  color: t.textMuted,
                  padding: 4,
                  margin: -4,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                overflowY: "auto",
                padding: "8px 10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <LikerPopoverList likers={likers} onNavigate={() => setModalOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
