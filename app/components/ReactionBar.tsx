"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Theme } from "../lib/theme";
import {
  DEFAULT_REACTION_ORDER,
  REACTION_META,
  topReactionCounts,
  type ReactionTopEntry,
  type ReactionType,
} from "../lib/reactions";

const OPEN_DELAY_MS = 80;
const HOVER_LEAVE_DELAY_MS = 220;
const LEADERBOARD_POPOVER_OPEN_MS = 90;
const LEADERBOARD_POPOVER_LEAVE_MS = 220;
/** Keep reactor-name popovers this far from the viewport edges. */
const LEADERBOARD_POPOVER_VIEWPORT_PAD_PX = 12;
/** Default thumbs-up / chosen emoji on the main trigger. */
const TRIGGER_EMOJI_FONT_PX = 20;

export type ReactionPickerTriggerProps = {
  t: Theme;
  disabled?: boolean;
  viewerReaction: ReactionType | null;
  /** Sum of reaction buckets (= distinct reactors). */
  totalCount: number;
  reactionOrder?: ReactionType[];
  onPick: (type: ReactionType) => void;
  busy?: boolean;
  showTriggerCount?: boolean;
  pickerOffsetX?: string;
};

/** Floating picker + primary “React” / emoji trigger — does not render leaderboard (see ReactionLeaderboard). */
export function ReactionPickerTrigger({
  t,
  disabled,
  viewerReaction,
  totalCount,
  reactionOrder = DEFAULT_REACTION_ORDER,
  onPick,
  busy,
  showTriggerCount = true,
  pickerOffsetX,
}: ReactionPickerTriggerProps) {
  const [open, setOpen] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    hoverTimerRef.current = null;
    leaveTimerRef.current = null;
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    hoverTimerRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    leaveTimerRef.current = setTimeout(() => setOpen(false), HOVER_LEAVE_DELAY_MS);
  }, [clearTimers]);

  useEffect(() => {
    function onDocPointerDown(ev: PointerEvent) {
      const root = wrapRef.current;
      if (!root || !open) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsNarrowViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const triggerEmoji = viewerReaction ? REACTION_META[viewerReaction].emoji : null;
  const stockEmoji = REACTION_META.like.emoji;
  const triggerAria = viewerReaction
    ? `${REACTION_META[viewerReaction].ariaLabel}, ${totalCount} reactions total`
    : "Open reactions — choose thumbs up or another emoji from the list";

  const pickerColumnCount = 2;
  const pickerRowCount = Math.ceil(reactionOrder.length / pickerColumnCount);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseLeave={() => scheduleClose()}
    >
      {open ? (
        <div
          role="toolbar"
          aria-label="Choose a reaction"
          onMouseEnter={() => clearTimers()}
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            transform: pickerOffsetX ? `translateX(${pickerOffsetX})` : undefined,
            marginBottom: 8,
            zIndex: 50,
            display: "grid",
            gridTemplateColumns: `repeat(${pickerColumnCount}, auto)`,
            gridTemplateRows: `repeat(${pickerRowCount}, auto)`,
            gridAutoFlow: "column",
            justifyItems: "center",
            gap: 4,
            padding: "8px 10px",
            borderRadius: 16,
            border: `1px solid ${t.border}`,
            background: t.surface,
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
          }}
        >
          {reactionOrder.map((rt) => (
            <button
              key={rt}
              type="button"
              title={
                viewerReaction === rt
                  ? `${REACTION_META[rt].ariaLabel} — click again to remove`
                  : REACTION_META[rt].ariaLabel
              }
              aria-label={
                viewerReaction === rt
                  ? `${REACTION_META[rt].ariaLabel}, selected — activate again to remove`
                  : REACTION_META[rt].ariaLabel
              }
              aria-pressed={viewerReaction === rt}
              disabled={disabled || busy}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPick(rt);
                setOpen(false);
              }}
              style={{
                fontSize: isNarrowViewport ? 20 : 22,
                lineHeight: 1,
                padding: "4px 5px",
                border: "none",
                borderRadius: 10,
                background:
                  viewerReaction === rt ? (t.surfaceHover ?? t.surface) : "transparent",
                cursor: disabled || busy ? "not-allowed" : "pointer",
                opacity: disabled || busy ? 0.55 : 1,
              }}
            >
              <span aria-hidden>{REACTION_META[rt].emoji}</span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerAria}
        title={
          viewerReaction
            ? `${REACTION_META[viewerReaction].ariaLabel} (${totalCount}). Shift+click to remove.`
            : "Open reactions — tap thumbs up in the list to apply it"
        }
        disabled={disabled || busy}
        onMouseEnter={() => scheduleOpen()}
        onClick={(e) => {
          e.preventDefault();
          if (disabled || busy) return;
          if (viewerReaction && e.shiftKey) {
            clearTimers();
            setOpen(false);
            onPick(viewerReaction);
            return;
          }
          setOpen((v) => !v);
        }}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: disabled || busy ? "not-allowed" : "pointer",
          fontWeight: 700,
          color: viewerReaction ? t.text : t.textMuted,
          opacity: busy ? 0.6 : 1,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
        }}
      >
        {viewerReaction ? (
          <>
            <span aria-hidden style={{ fontSize: TRIGGER_EMOJI_FONT_PX, lineHeight: 1 }}>
              {triggerEmoji}
            </span>
            {showTriggerCount && <span>{totalCount}</span>}
          </>
        ) : (
          <span aria-hidden style={{ fontSize: TRIGGER_EMOJI_FONT_PX, lineHeight: 1 }}>
            {stockEmoji}
          </span>
        )}
      </button>
    </div>
  );
}

export type ReactionLeaderboardProps = {
  t: Theme;
  countsByType: Partial<Record<ReactionType, number>>;
  /** When false, only reaction emojis render (counts stay in title for hover/accessibility). */
  showCounts?: boolean;
  /**
   * When set (including `{}`), emoji chips open a list of reactor display names on hover (fine pointer)
   * or tap (coarse pointer). Numeric counts are omitted on the chips.
   */
  reactorNamesByType?: Partial<Record<ReactionType, string[]>>;
};

function ReactionLeaderboardWithNames({
  t,
  top3,
  reactorNamesByType,
}: {
  t: Theme;
  top3: ReactionTopEntry[];
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
}) {
  const [openFor, setOpenFor] = useState<ReactionType | null>(null);
  const [finePointerHover, setFinePointerHover] = useState(false);
  const [popoverShiftX, setPopoverShiftX] = useState(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Partial<Record<ReactionType, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointerHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clearTimers = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    hoverTimerRef.current = null;
    leaveTimerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!openFor) {
      setPopoverShiftX(0);
      return;
    }
    const popover = popoverRef.current;
    const trigger = triggerRefs.current[openFor];
    if (!popover || !trigger || typeof window === "undefined") return;

    const popRect = popover.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const pad = LEADERBOARD_POPOVER_VIEWPORT_PAD_PX;
    const viewportW = window.innerWidth;
    // Prefer centering on the emoji chip, then nudge so the panel stays on-screen.
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - popRect.width / 2;
    const clampedLeft = Math.min(
      Math.max(centeredLeft, pad),
      Math.max(pad, viewportW - pad - popRect.width),
    );
    setPopoverShiftX(clampedLeft - centeredLeft);
  }, [openFor, reactorNamesByType]);

  useEffect(() => {
    if (!openFor) return;

    const close = () => setOpenFor(null);

    function onDocPointerDown(ev: PointerEvent) {
      const root = wrapRef.current;
      if (!root) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      close();
    }

    function onScrollOrResize(ev: Event) {
      const root = wrapRef.current;
      if (!root) return;
      const target = ev.target;
      if (target instanceof Node && root.contains(target)) return;
      close();
    }

    document.addEventListener("pointerdown", onDocPointerDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [openFor]);

  useEffect(() => {
    if (!openFor) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setOpenFor(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFor]);

  const ariaSummary = top3
    .map(({ type, count }) => {
      const names = reactorNamesByType[type];
      const nm = names?.length ? names.join(", ") : `${count}`;
      return `${REACTION_META[type].ariaLabel}: ${nm}`;
    })
    .join("; ");

  const popoverMaxWidth =
    typeof window !== "undefined"
      ? Math.min(280, window.innerWidth - LEADERBOARD_POPOVER_VIEWPORT_PAD_PX * 2)
      : 280;

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={ariaSummary}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
      }}
    >
      {top3.map(({ type, count }) => {
        const names = reactorNamesByType[type] ?? [];
        const open = openFor === type;
        const scheduleOpen = () => {
          clearTimers();
          hoverTimerRef.current = setTimeout(() => setOpenFor(type), LEADERBOARD_POPOVER_OPEN_MS);
        };
        const scheduleClose = () => {
          clearTimers();
          leaveTimerRef.current = setTimeout(() => {
            setOpenFor((cur) => (cur === type ? null : cur));
          }, LEADERBOARD_POPOVER_LEAVE_MS);
        };

        return (
          <div
            key={type}
            ref={(el) => {
              triggerRefs.current[type] = el;
            }}
            style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
            onMouseEnter={() => {
              if (!finePointerHover) return;
              scheduleOpen();
            }}
            onMouseLeave={() => {
              if (!finePointerHover) return;
              scheduleClose();
            }}
          >
            {open ? (
              <div
                ref={popoverRef}
                role="tooltip"
                id={`reaction-names-${type}`}
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: `translateX(calc(-50% + ${popoverShiftX}px))`,
                  marginBottom: 6,
                  zIndex: 60,
                  minWidth: 140,
                  maxWidth: popoverMaxWidth,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: t.surface,
                  boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 12,
                    color: t.textMuted,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span aria-hidden>{REACTION_META[type].emoji}</span>
                  <span>{REACTION_META[type].ariaLabel}</span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    maxHeight: 220,
                    overflowY: "auto",
                    fontSize: 13,
                    fontWeight: 600,
                    color: t.text,
                    lineHeight: 1.35,
                  }}
                >
                  {names.length === 0 ? (
                    <li style={{ listStyle: "none", marginLeft: -16, color: t.textMuted }}>
                      No reactors yet
                    </li>
                  ) : (
                    names.map((n, i) => (
                      <li key={`${type}-${i}-${n}`}>{n}</li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-controls={open ? `reaction-names-${type}` : undefined}
              aria-label={`${REACTION_META[type].ariaLabel}: ${names.length ? names.join(", ") : `${count} reaction${count === 1 ? "" : "s"}`}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (finePointerHover) return;
                setOpenFor((cur) => (cur === type ? null : type));
              }}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px 4px",
                margin: 0,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                fontWeight: 700,
                color: t.textMuted,
              }}
            >
              <span aria-hidden>{REACTION_META[type].emoji}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Top reaction types by count (max 3); hides zeros. */
export function ReactionLeaderboard({
  t,
  countsByType,
  showCounts = true,
  reactorNamesByType,
}: ReactionLeaderboardProps) {
  const top3 = topReactionCounts(countsByType, 3);
  if (top3.length === 0) return null;

  if (reactorNamesByType !== undefined) {
    return (
      <ReactionLeaderboardWithNames t={t} top3={top3} reactorNamesByType={reactorNamesByType} />
    );
  }

  return (
    <div
      role="group"
      aria-label={top3.map(({ type, count }) => `${REACTION_META[type].ariaLabel}: ${count}`).join(", ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showCounts ? 10 : 6,
        flexShrink: 0,
      }}
    >
      {top3.map(({ type, count }) => (
        <span
          key={type}
          title={`${REACTION_META[type].ariaLabel}: ${count}`}
          style={{
            fontSize: 14,
            color: t.textMuted,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden>{REACTION_META[type].emoji}</span>
          {showCounts ? (
            <>
              {" "}
              <span>{count}</span>
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}
