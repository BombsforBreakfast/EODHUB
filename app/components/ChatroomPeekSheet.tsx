"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getAccessToken, supabase } from "../lib/lib/supabaseClient";
import { useAuth } from "../lib/auth/AuthProvider";
import {
  getChatroomLastOpenedAt,
  isChatroomEntryAvailable,
  markChatroomOpened,
  type ChatroomPeekLatest,
} from "../lib/chatroom";
import { useOnlinePresence } from "./OnlinePresenceProvider";
import { useChatroomSheet } from "./ChatroomSheetContext";

const ChatroomModal = dynamic(() => import("./ChatroomModal"), { ssr: false });

const CRT = {
  bg: "#000000",
  panel: "#020802",
  green: "#33ff66",
  greenDim: "#1a9940",
  greenMuted: "#0d6b2c",
  greenFaint: "rgba(51, 255, 102, 0.35)",
  text: "#d8ffd8",
  mono: 'var(--font-geist-mono), "Courier New", Courier, monospace',
} as const;

/** Same handle palette as ChatroomModal so peek matches the open room. */
const HANDLE_COLORS = [
  "#ffff66",
  "#66ccff",
  "#ff8866",
  "#cc88ff",
  "#ffaa33",
  "#66ffcc",
  "#ff66aa",
  "#aaccff",
  "#88ff88",
  "#ffcc66",
] as const;

function handleColor(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return HANDLE_COLORS[Math.abs(h) % HANDLE_COLORS.length];
}

function terminalHandle(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "")
    .slice(0, 24);
  return (cleaned || "MEMBER").toUpperCase();
}

/** Match middle-rail feel for the collapsed peek bar. */
const SHEET_MAX_WIDTH = 720;
const PEEK_HEIGHT = 56;
const FAB_SIZE = 56;
const PEEK_POLL_MS = 20_000;
const DESKTOP_MQ = "(min-width: 901px)";
const DOUBLE_TAP_MS = 300;
const SINGLE_TAP_OPEN_DELAY_MS = 280;
/** Finger must slide this far before we treat it as a drag (not a tap). */
const DRAG_MOVE_PX = 12;

type FabPos = { x: number; y: number };

type ExpandedFrame = {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Desktop docks to center column; mobile is full-viewport takeover. */
  mode: "desktop" | "mobile";
};

const HIDDEN_PATH_PREFIXES = [
  "/games",
  "/login",
  "/onboarding",
  "/verify-email",
  "/email-verified",
  "/reset-password",
  "/pending",
  "/subscribe",
];

function shouldHideSheet(pathname: string | null): boolean {
  if (!pathname) return true;
  return HIDDEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function formatUnread(n: number): string {
  if (n > 99) return "99+";
  return String(n);
}

function minimizedStorageKey(userId: string) {
  return `eod_chatroom_peek_minimized:${userId}`;
}

function fabPosStorageKey(userId: string) {
  return `eod_chatroom_peek_fab_pos:${userId}`;
}

function readMinimized(userId: string | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(minimizedStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeMinimized(userId: string | null, value: boolean) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(minimizedStorageKey(userId), value ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

function defaultFabPos(): FabPos {
  const margin = 16;
  const safeBottom =
    typeof window !== "undefined"
      ? Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--sat-bottom") || "0",
        ) || 0
      : 0;
  // Fallback: leave room for home indicator without reading env() in JS.
  const bottomPad = Math.max(safeBottom, 16);
  return {
    x: Math.max(8, window.innerWidth - FAB_SIZE - margin),
    y: Math.max(8, window.innerHeight - FAB_SIZE - margin - bottomPad),
  };
}

function clampFabPos(pos: FabPos): FabPos {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - FAB_SIZE - pad);
  const maxY = Math.max(pad, window.innerHeight - FAB_SIZE - pad);
  return {
    x: Math.min(maxX, Math.max(pad, pos.x)),
    y: Math.min(maxY, Math.max(pad, pos.y)),
  };
}

function readFabPos(userId: string | null): FabPos {
  if (!userId || typeof window === "undefined") return { x: 16, y: 16 };
  try {
    const raw = window.localStorage.getItem(fabPosStorageKey(userId));
    if (!raw) return clampFabPos(defaultFabPos());
    const parsed = JSON.parse(raw) as FabPos;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") {
      return clampFabPos(defaultFabPos());
    }
    return clampFabPos(parsed);
  } catch {
    return clampFabPos(defaultFabPos());
  }
}

function writeFabPos(userId: string | null, pos: FabPos) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(fabPosStorageKey(userId), JSON.stringify(clampFabPos(pos)));
  } catch {
    /* ignore */
  }
}

function measureExpandedFrame(): ExpandedFrame {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isDesktop = window.matchMedia(DESKTOP_MQ).matches;
  if (isDesktop) {
    const center = document.querySelector(".desktop-layout-center");
    if (center instanceof HTMLElement) {
      const r = center.getBoundingClientRect();
      const top = Math.max(0, Math.floor(r.top));
      const left = Math.max(0, Math.floor(r.left));
      const width = Math.max(280, Math.floor(r.width));
      const height = Math.max(320, Math.floor(vh - top));
      return { top, left, width, height, mode: "desktop" };
    }
  }
  return { top: 0, left: 0, width: vw, height: vh, mode: "mobile" };
}

/**
 * Global Team Room peek → expand.
 * Collapsed: bottom peek bar (or minimized green FAB). Expanded: center pane / full mobile.
 * Hidden on arcade/games and auth/gate routes.
 */
export default function ChatroomPeekSheet() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { onlineUserIds } = useOnlinePresence();
  const { expanded, expand, collapse } = useChatroomSheet();
  const [gamePlaying, setGamePlaying] = useState(false);
  const [peekSuppressed, setPeekSuppressed] = useState(false);
  const [latest, setLatest] = useState<ChatroomPeekLatest | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [frame, setFrame] = useState<ExpandedFrame | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [fabPos, setFabPos] = useState<FabPos>({ x: 16, y: 16 });
  const [fabDragging, setFabDragging] = useState(false);
  const [peekPressed, setPeekPressed] = useState(false);

  const pendingOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAtRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null>(null);

  const currentUserId = user?.id ?? null;
  const unlocked = isChatroomEntryAvailable(currentUserId);
  const pathHidden = shouldHideSheet(pathname);
  const hidden = !unlocked || pathHidden || gamePlaying || peekSuppressed;

  const clearFabTimers = useCallback(() => {
    if (pendingOpenTimerRef.current) {
      clearTimeout(pendingOpenTimerRef.current);
      pendingOpenTimerRef.current = null;
    }
  }, []);

  const refreshPeek = useCallback(async () => {
    if (!currentUserId) return;
    const token = await getAccessToken({ source: "ChatroomPeekSheet.peek" });
    if (!token) return;
    const since = getChatroomLastOpenedAt(currentUserId);
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    try {
      const res = await fetch(`/api/chatroom/peek${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        latest?: ChatroomPeekLatest | null;
        unread_count?: number;
      };
      setLatest(body.latest ?? null);
      setUnreadCount(typeof body.unread_count === "number" ? body.unread_count : 0);
    } catch {
      /* ignore transient peek errors */
    }
  }, [currentUserId]);

  const openSheet = useCallback(() => {
    markChatroomOpened(currentUserId);
    setUnreadCount(0);
    expand();
  }, [currentUserId, expand]);

  const minimizeBar = useCallback(() => {
    setMinimized(true);
    writeMinimized(currentUserId, true);
    setFabPos((prev) => {
      const next = clampFabPos(prev);
      writeFabPos(currentUserId, next);
      return next;
    });
  }, [currentUserId]);

  const restoreBar = useCallback(() => {
    clearFabTimers();
    setMinimized(false);
    writeMinimized(currentUserId, false);
  }, [clearFabTimers, currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      setMinimized(false);
      return;
    }
    setMinimized(readMinimized(currentUserId));
    setFabPos(readFabPos(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => {
      setGamePlaying(document.body.classList.contains("game-playing-active"));
      setPeekSuppressed(document.body.classList.contains("chatroom-peek-suppressed"));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (hidden || !unlocked) return;
    if (searchParams.get("chatroom") !== "1") return;
    openSheet();
    const params = new URLSearchParams(searchParams.toString());
    params.delete("chatroom");
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    router.replace(next, { scroll: false });
  }, [hidden, unlocked, searchParams, openSheet, pathname, router]);

  useEffect(() => {
    if (hidden && expanded) collapse();
  }, [hidden, expanded, collapse]);

  // Mark read whenever the sheet is open (including entry from home strip).
  useEffect(() => {
    if (!expanded || !currentUserId) return;
    markChatroomOpened(currentUserId);
    setUnreadCount(0);
  }, [expanded, currentUserId]);

  // Live peek: fetch + realtime + light poll while collapsed and visible.
  useEffect(() => {
    if (hidden || expanded || !currentUserId) return;
    void refreshPeek();

    const channel = supabase
      .channel(`chatroom-peek-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatroom_messages" },
        () => {
          void refreshPeek();
        },
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void refreshPeek();
    }, PEEK_POLL_MS);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [hidden, expanded, currentUserId, refreshPeek]);

  // Dock expanded chat to the center column (desktop) or full viewport (mobile).
  useLayoutEffect(() => {
    if (!expanded) {
      setFrame(null);
      return;
    }
    const sync = () => setFrame(measureExpandedFrame());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    const mq = window.matchMedia(DESKTOP_MQ);
    mq.addEventListener("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      mq.removeEventListener("change", sync);
    };
  }, [expanded, pathname]);

  // Keep FAB on-screen across orientation / resize.
  useEffect(() => {
    if (!minimized || hidden) return;
    const onResize = () => setFabPos((p) => clampFabPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minimized, hidden]);

  // Reserve space for the full peek bar only (not when minimized to circle).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const showBarPad = !hidden && !expanded && !minimized;
    if (showBarPad) {
      const pad = `calc(${PEEK_HEIGHT}px + 18px + env(safe-area-inset-bottom))`;
      const fabBottom = `calc(10px + env(safe-area-inset-bottom) + ${PEEK_HEIGHT}px + 12px)`;
      document.body.style.setProperty("--chatroom-peek-pad", pad);
      document.body.style.setProperty("--bug-report-fab-bottom", fabBottom);
      document.body.style.paddingBottom = pad;
    } else if (!hidden && !expanded && minimized) {
      document.body.style.removeProperty("--chatroom-peek-pad");
      document.body.style.paddingBottom = "";
      document.body.style.setProperty(
        "--bug-report-fab-bottom",
        "calc(16px + env(safe-area-inset-bottom))",
      );
    } else {
      document.body.style.removeProperty("--chatroom-peek-pad");
      document.body.style.removeProperty("--bug-report-fab-bottom");
      document.body.style.paddingBottom = "";
    }
    return () => {
      document.body.style.removeProperty("--chatroom-peek-pad");
      document.body.style.removeProperty("--bug-report-fab-bottom");
      document.body.style.paddingBottom = "";
    };
  }, [hidden, expanded, minimized]);

  useEffect(() => () => clearFabTimers(), [clearFabTimers]);

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    clearFabTimers();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: fabPos.x,
      originY: fabPos.y,
      dragging: false,
    };
  };

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const dist = Math.hypot(dx, dy);

    // Drag starts as soon as the finger slides — no long-press wait (finicky on touch).
    if (!d.dragging && dist > DRAG_MOVE_PX) {
      d.dragging = true;
      setFabDragging(true);
      clearFabTimers();
      lastTapAtRef.current = 0;
    }
    if (d.dragging) {
      setFabPos(clampFabPos({ x: d.originX + dx, y: d.originY + dy }));
    }
  };

  const onFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (d?.dragging) {
      setFabDragging(false);
      setFabPos((prev) => {
        const next = clampFabPos(prev);
        writeFabPos(currentUserId, next);
        return next;
      });
      lastTapAtRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTapAtRef.current < DOUBLE_TAP_MS) {
      // Double tap → restore full bottom bar.
      lastTapAtRef.current = 0;
      clearFabTimers();
      restoreBar();
      return;
    }

    lastTapAtRef.current = now;
    pendingOpenTimerRef.current = setTimeout(() => {
      pendingOpenTimerRef.current = null;
      lastTapAtRef.current = 0;
      openSheet();
    }, SINGLE_TAP_OPEN_DELAY_MS);
  };

  const onFabPointerCancel = () => {
    clearFabTimers();
    dragRef.current = null;
    setFabDragging(false);
  };

  if (hidden) return null;

  const onlineCount = onlineUserIds.length;
  const handle = latest ? terminalHandle(latest.author_name) : null;
  const nameColor = latest ? handleColor(latest.user_id) : CRT.greenDim;

  const panelFrame = frame ?? {
    top: 0,
    left: 0,
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    mode: "mobile" as const,
  };

  const unreadBadge = unreadCount > 0 && (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        minWidth: 22,
        height: 22,
        padding: "0 6px",
        borderRadius: 999,
        background: CRT.green,
        color: "#001a08",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: "22px",
        textAlign: "center",
        boxShadow: `0 0 0 2px ${CRT.bg}, 0 0 12px ${CRT.greenFaint}`,
        pointerEvents: "none",
      }}
    >
      {formatUnread(unreadCount)}
    </span>
  );

  return (
    <>
      {!expanded && !minimized && (
        <div
          className="chatroom-peek-bar"
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: "calc(10px + env(safe-area-inset-bottom))",
            marginLeft: "auto",
            marginRight: "auto",
            width: `min(${SHEET_MAX_WIDTH}px, calc(100% - 16px))`,
            zIndex: 11000,
            fontFamily: CRT.mono,
            boxSizing: "border-box",
            minHeight: PEEK_HEIGHT,
            display: "flex",
            alignItems: "stretch",
            background: CRT.panel,
            color: CRT.green,
            border: `1px solid ${CRT.green}`,
            boxShadow: peekPressed
              ? `0 0 0 1px ${CRT.greenMuted}, 0 2px 10px rgba(0,0,0,0.4)`
              : `0 0 0 1px ${CRT.greenMuted}, 0 8px 28px rgba(0,0,0,0.45)`,
            transform: peekPressed ? "scale(0.985)" : "scale(1)",
            transformOrigin: "center bottom",
            transition: "transform 90ms ease-out, box-shadow 90ms ease-out",
            WebkitTapHighlightColor: "transparent",
            userSelect: "none",
          }}
        >
          <button
            type="button"
            aria-label={
              unreadCount > 0
                ? `Open Team Room, ${unreadCount} unread`
                : "Open Team Room"
            }
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPeekPressed(true);
            }}
            onPointerUp={(e) => {
              if (e.button !== 0) return;
              const wasPressed = peekPressed;
              setPeekPressed(false);
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* already released */
              }
              if (!wasPressed) return;
              const r = e.currentTarget.getBoundingClientRect();
              const { clientX: x, clientY: y } = e;
              if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
              openSheet();
            }}
            onPointerCancel={() => setPeekPressed(false)}
            onLostPointerCapture={() => setPeekPressed(false)}
            onClick={(e) => e.preventDefault()}
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 8px 8px 16px",
              border: "none",
              background: "transparent",
              color: "inherit",
              fontFamily: "inherit",
              cursor: "pointer",
              textAlign: "left",
              touchAction: "manipulation",
            }}
          >
            <div style={{ minWidth: 0, flex: 1, pointerEvents: "none" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  textShadow: `0 0 8px ${CRT.greenFaint}`,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                Team Room // live
                <span style={{ color: CRT.greenDim, fontWeight: 500, marginLeft: 8, letterSpacing: 0.4 }}>
                  · {onlineCount} online
                </span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {latest && handle ? (
                  <>
                    <span style={{ color: nameColor, fontWeight: 700 }}>&lt;{handle}&gt;</span>
                    <span style={{ color: CRT.text }}> {latest.body}</span>
                  </>
                ) : (
                  <span style={{ color: CRT.greenDim }}>{onlineCount} online — tap to expand</span>
                )}
              </div>
            </div>
          </button>

          <button
            type="button"
            aria-label="Minimize Team Room"
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              minimizeBar();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0,
              width: 44,
              border: "none",
              borderLeft: `1px solid ${CRT.greenMuted}`,
              background: "transparent",
              color: CRT.green,
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1,
              cursor: "pointer",
              fontFamily: CRT.mono,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            −
          </button>

          {unreadCount > 0 && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -8,
                right: -8,
                minWidth: 22,
                height: 22,
                padding: "0 6px",
                borderRadius: 999,
                background: CRT.green,
                color: "#001a08",
                fontSize: 11,
                fontWeight: 800,
                lineHeight: "22px",
                textAlign: "center",
                boxShadow: `0 0 0 2px ${CRT.bg}, 0 0 12px ${CRT.greenFaint}`,
                pointerEvents: "none",
              }}
            >
              {formatUnread(unreadCount)}
            </span>
          )}
        </div>
      )}

      {!expanded && minimized && (
        <button
          type="button"
          className="chatroom-peek-fab"
          aria-label={
            unreadCount > 0
              ? `Open Team Room, ${unreadCount} unread. Drag to move. Double tap to restore bar.`
              : "Open Team Room. Drag to move. Double tap to restore bar."
          }
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          onPointerCancel={onFabPointerCancel}
          onLostPointerCapture={onFabPointerCancel}
          onClick={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: fabPos.x,
            top: fabPos.y,
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: "50%",
            zIndex: 11000,
            boxSizing: "border-box",
            padding: 0,
            margin: 0,
            border: `2px solid ${CRT.green}`,
            background: CRT.greenDim,
            color: CRT.green,
            boxShadow: fabDragging
              ? `0 0 0 2px ${CRT.greenMuted}, 0 4px 18px rgba(0,0,0,0.55), 0 0 16px ${CRT.greenFaint}`
              : `0 0 0 1px ${CRT.greenMuted}, 0 8px 24px rgba(0,0,0,0.5), 0 0 12px ${CRT.greenFaint}`,
            cursor: fabDragging ? "grabbing" : "grab",
            fontFamily: CRT.mono,
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
            userSelect: "none",
            // Always none so mobile scroll/gestures don't steal the drag.
            touchAction: "none",
            transition: fabDragging ? "none" : "box-shadow 90ms ease-out",
          }}
        >
          <span aria-hidden style={{ textShadow: `0 0 8px ${CRT.greenFaint}` }}>
            TR
          </span>
          {unreadBadge}
        </button>
      )}

      {expanded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 11000,
            pointerEvents: "auto",
          }}
        >
          {panelFrame.mode === "desktop" && (
            <button
              type="button"
              aria-label="Collapse Team Room"
              onClick={collapse}
              style={{
                position: "absolute",
                inset: 0,
                border: "none",
                background: "rgba(0,0,0,0.4)",
                cursor: "pointer",
                padding: 0,
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              top: panelFrame.top,
              left: panelFrame.left,
              width: panelFrame.width,
              height: panelFrame.height,
              border: panelFrame.mode === "desktop" ? `1px solid ${CRT.green}` : "none",
              boxShadow:
                panelFrame.mode === "desktop"
                  ? `0 0 0 1px ${CRT.greenMuted}, 0 12px 40px rgba(0,0,0,0.55)`
                  : "none",
              background: CRT.bg,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              boxSizing: "border-box",
            }}
          >
            <ChatroomModal
              open
              variant="sheet"
              currentUserId={currentUserId}
              onClose={collapse}
            />
          </div>
        </div>
      )}
    </>
  );
}
