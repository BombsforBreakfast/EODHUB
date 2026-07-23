"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
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
const PEEK_POLL_MS = 20_000;
const DESKTOP_MQ = "(min-width: 901px)";

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
 * Collapsed: bottom peek bar. Expanded: fills desktop center pane / full mobile view.
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
  const [latest, setLatest] = useState<ChatroomPeekLatest | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [frame, setFrame] = useState<ExpandedFrame | null>(null);

  const currentUserId = user?.id ?? null;
  const unlocked = isChatroomEntryAvailable(currentUserId);
  const pathHidden = shouldHideSheet(pathname);
  const hidden = !unlocked || pathHidden || gamePlaying;

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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setGamePlaying(document.body.classList.contains("game-playing-active"));
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

  // Reserve space so page content isn't covered by the fixed peek bar.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const pad = !hidden && !expanded ? `calc(${PEEK_HEIGHT}px + 18px + env(safe-area-inset-bottom))` : "";
    document.body.style.setProperty("--chatroom-peek-pad", pad);
    document.body.style.paddingBottom = pad || "";
    return () => {
      document.body.style.removeProperty("--chatroom-peek-pad");
      document.body.style.paddingBottom = "";
    };
  }, [hidden, expanded]);

  if (hidden) return null;

  const onlineCount = onlineUserIds.length;
  const handle = latest ? terminalHandle(latest.author_name) : null;
  const nameColor = latest ? handleColor(latest.user_id) : CRT.greenDim;

  const shellStyle: CSSProperties = {
    position: "fixed",
    left: "50%",
    transform: "translateX(-50%)",
    width: `min(${SHEET_MAX_WIDTH}px, calc(100% - 16px))`,
    zIndex: 11000,
    fontFamily: CRT.mono,
    boxSizing: "border-box",
  };

  const panelFrame = frame ?? {
    top: 0,
    left: 0,
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    mode: "mobile" as const,
  };

  return (
    <>
      {!expanded && (
        <button
          type="button"
          onClick={openSheet}
          aria-label={
            unreadCount > 0
              ? `Open Team Room, ${unreadCount} unread`
              : "Open Team Room"
          }
          style={{
            ...shellStyle,
            position: "fixed",
            bottom: "calc(10px + env(safe-area-inset-bottom))",
            minHeight: PEEK_HEIGHT,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            background: CRT.panel,
            color: CRT.green,
            border: `1px solid ${CRT.green}`,
            boxShadow: `0 0 0 1px ${CRT.greenMuted}, 0 8px 28px rgba(0,0,0,0.45)`,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
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
