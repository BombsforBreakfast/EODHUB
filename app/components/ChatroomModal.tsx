"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { getAccessToken, supabase } from "../lib/lib/supabaseClient";
import {
  CHATROOM_MESSAGE_MAX_LEN,
  dismissChatroomWarningBannerForSession,
  isChatroomWarningBannerDismissed,
  type ChatroomMessageDto,
} from "../lib/chatroom";
import { splitMentionTokens } from "../lib/mentions";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../lib/flagCategories";
import { useOnlinePresence } from "./OnlinePresenceProvider";
import HideBlockUserButton from "./HideBlockUserButton";
import MentionTextarea from "./MentionTextarea";
import { LikerAvatar } from "./PostLikersStack";

type Props = {
  open: boolean;
  currentUserId: string | null;
  onClose: () => void;
  /** fullscreen = legacy overlay; sheet = fill parent peek panel */
  variant?: "fullscreen" | "sheet";
};

const MOBILE_AVATAR = 28;
const MOBILE_AVATAR_OVERLAP = 6;
const MOBILE_AVATAR_MAX = 10;

/** 90s phosphor terminal palette — scoped to the chatroom shell. */
const CRT = {
  bg: "#000000",
  panel: "#020802",
  green: "#33ff66",
  greenDim: "#1a9940",
  greenMuted: "#0d6b2c",
  greenFaint: "rgba(51, 255, 102, 0.35)",
  amber: "#ff9900",
  text: "#d8ffd8",
  danger: "#ff4444",
  border: "1px solid #33ff66",
  borderAmber: "1px solid #ff9900",
  mono: 'var(--font-geist-mono), "Courier New", Courier, monospace',
} as const;

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

const RULES_COPY = [
  "Be decent. This is a community of professionals.",
  "No operational security (OPSEC) details. Ever.",
  "No harassment, hate, or doxxing.",
  "No spam, scams, or recruiting that breaks the law.",
  "Nothing's saved. Messages self-destruct after 24 hours. Screenshots are on you.",
  "Report anything that crosses the line. Admins review flags.",
] as const;

type OnlineProfile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean | null;
};

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

function displayNameFromProfile(p: OnlineProfile): string {
  return (
    p.display_name?.trim() ||
    `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
    "Member"
  );
}

function formatTerminalTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "--:--";
  }
}

function renderChatBody(raw: string): ReactNode {
  const parts = splitMentionTokens(raw);
  if (parts.length === 0) return raw;
  return parts.map((part, i) => {
    if (part.type === "text") {
      return <span key={`t-${i}`}>{part.value}</span>;
    }
    return (
      <Link
        key={`m-${i}-${part.userId}`}
        href={`/profile/${part.userId}`}
        style={{
          color: "#66ffcc",
          fontWeight: 700,
          textDecoration: "none",
          textShadow: "0 0 6px rgba(102,255,204,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        @{part.name}
      </Link>
    );
  });
}

export default function ChatroomModal({ open, currentUserId, onClose, variant = "fullscreen" }: Props) {
  const { onlineUserIds } = useOnlinePresence();
  const [messages, setMessages] = useState<ChatroomMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRawRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [reportForId, setReportForId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [warningBannerDismissed, setWarningBannerDismissed] = useState(false);
  const [onlineProfiles, setOnlineProfiles] = useState<Map<string, OnlineProfile>>(new Map());
  const [namePopupId, setNamePopupId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mobileOnlineRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const token = await getAccessToken({ source: "ChatroomModal.load" });
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chatroom/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        messages?: ChatroomMessageDto[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not load chat.");
        return;
      }
      const now = Date.now();
      setMessages((body.messages ?? []).filter((m) => new Date(m.expires_at).getTime() > now));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadMessages();
  }, [open, loadMessages]);

  useEffect(() => {
    if (!open) return;
    setWarningBannerDismissed(isChatroomWarningBannerDismissed());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel("chatroom-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatroom_messages" },
        () => {
          void loadMessages();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, loadMessages]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

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
        if (rulesOpen) setRulesOpen(false);
        else if (reportForId) setReportForId(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, rulesOpen, reportForId]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || onlineUserIds.length === 0) {
      if (open && onlineUserIds.length === 0) setOnlineProfiles(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, photo_url, service, is_employer")
        .in("user_id", onlineUserIds.slice(0, 80));
      if (cancelled || !data) return;
      const map = new Map<string, OnlineProfile>();
      for (const row of data as OnlineProfile[]) map.set(row.user_id, row);
      setOnlineProfiles(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, onlineUserIds]);

  const onlineHandles = useMemo(() => {
    return onlineUserIds
      .map((id) => {
        const p = onlineProfiles.get(id);
        const name = p ? displayNameFromProfile(p) : id.slice(0, 8);
        return {
          id,
          name,
          handle: terminalHandle(name),
          color: handleColor(id),
          photo_url: p?.photo_url ?? null,
          service: p?.service ?? null,
          is_employer: p?.is_employer ?? null,
        };
      })
      .sort((a, b) => a.handle.localeCompare(b.handle));
  }, [onlineProfiles, onlineUserIds]);

  const onlinePreview = onlineHandles.slice(0, 16);
  const onlineExtra = Math.max(0, onlineHandles.length - onlinePreview.length);
  const mobileAvatarRows = onlineHandles.slice(0, MOBILE_AVATAR_MAX);
  const mobileAvatarExtra = Math.max(0, onlineHandles.length - mobileAvatarRows.length);
  const namePopupUser = namePopupId
    ? onlineHandles.find((u) => u.id === namePopupId) ?? null
    : null;

  useEffect(() => {
    if (!namePopupId) return;
    function onPointerDown(e: PointerEvent) {
      if (mobileOnlineRef.current?.contains(e.target as Node)) return;
      setNamePopupId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [namePopupId]);

  useEffect(() => {
    if (!open) setNamePopupId(null);
  }, [open]);

  async function sendMessage() {
    const text = (draftRawRef.current || draft).trim();
    if (!text || sending) return;
    const token = await getAccessToken({ source: "ChatroomModal.send" });
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chatroom/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: ChatroomMessageDto;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not send.");
        return;
      }
      if (body.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === body.message!.id)) return prev;
          return [...prev, body.message!];
        });
      }
      setDraft("");
      draftRawRef.current = "";
    } finally {
      setSending(false);
    }
  }

  async function reportMessage(messageId: string, category: FlagCategory) {
    const token = await getAccessToken({ source: "ChatroomModal.report" });
    if (!token) return;
    setReporting(true);
    try {
      const res = await fetch("/api/chatroom/report", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageId, category }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(body.error || "Could not report.");
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setReportForId(null);
      setMenuForId(null);
      window.alert("Thanks — reported to admins and removed from the room.");
    } finally {
      setReporting(false);
    }
  }

  if (!open) return null;

  const btnBase: CSSProperties = {
    fontFamily: CRT.mono,
    background: "transparent",
    color: CRT.green,
    border: CRT.border,
    borderRadius: 0,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  };

  const isSheet = variant === "sheet";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="EOD Hub Team Room"
      style={{
        position: isSheet ? "relative" : "fixed",
        inset: isSheet ? undefined : 0,
        width: isSheet ? "100%" : undefined,
        height: isSheet ? "100%" : undefined,
        zIndex: isSheet ? 1 : 12000,
        background: CRT.bg,
        color: CRT.text,
        fontFamily: CRT.mono,
        display: "flex",
        flexDirection: "column",
        padding: isSheet
          ? "calc(8px + env(safe-area-inset-top)) 8px calc(8px + env(safe-area-inset-bottom))"
          : "10px 10px calc(10px + env(safe-area-inset-bottom))",
        gap: 8,
        boxSizing: "border-box",
        minHeight: 0,
      }}
    >
      {/* CRT scanlines */}
      <div
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          zIndex: 1,
          opacity: 0.07,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.55) 3px)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          border: CRT.border,
          background: CRT.panel,
          boxShadow: `0 0 0 1px ${CRT.greenMuted}, inset 0 0 40px rgba(0, 40, 0, 0.35)`,
        }}
      >
        <header
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 0,
            borderBottom: CRT.border,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 14px 10px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: CRT.green,
                  fontWeight: 700,
                  fontSize: "clamp(13px, 2.8vw, 16px)",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  textShadow: `0 0 8px ${CRT.greenFaint}`,
                }}
              >
                EOD-HUB TEAM ROOM // CONNECT. SHARE. GROW.
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                textAlign: "right",
                color: CRT.green,
                fontSize: 12,
                letterSpacing: 0.8,
                paddingTop: 2,
              }}
            >
              <div>USERS ONLINE: {onlineUserIds.length}</div>
              <button
                type="button"
                aria-label={isSheet ? "Collapse team room" : "Close team room"}
                onClick={onClose}
                style={{
                  ...btnBase,
                  marginTop: 8,
                  padding: "4px 10px",
                  fontSize: 11,
                  color: CRT.greenDim,
                  borderColor: CRT.greenMuted,
                }}
              >
                {isSheet ? "[ COLLAPSE ]" : "[ ESC / EXIT ]"}
              </button>
            </div>
          </div>

          {/* Mobile-only stacked online avatars */}
          <div
            ref={mobileOnlineRef}
            className="chatroom-crt-mobile-online"
            style={{
              display: "none",
              alignItems: "center",
              gap: 10,
              padding: "0 14px 10px",
              position: "relative",
            }}
          >
            <span
              style={{
                color: CRT.greenDim,
                fontSize: 10,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              Online
            </span>
            {mobileAvatarRows.length === 0 ? (
              <span style={{ color: CRT.greenMuted, fontSize: 11 }}>Just you</span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
                {mobileAvatarRows.map((u, i) => {
                  const selected = namePopupId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-label={u.name}
                      aria-expanded={selected}
                      onClick={() => setNamePopupId((prev) => (prev === u.id ? null : u.id))}
                      style={{
                        marginLeft: i === 0 ? 0 : -MOBILE_AVATAR_OVERLAP,
                        position: "relative",
                        zIndex: selected ? 40 : mobileAvatarRows.length - i,
                        padding: 0,
                        border: selected ? `1px solid ${CRT.green}` : `1px solid ${CRT.greenMuted}`,
                        borderRadius: "50%",
                        background: "#000",
                        cursor: "pointer",
                        lineHeight: 0,
                        boxShadow: selected ? `0 0 8px ${CRT.greenFaint}` : "none",
                      }}
                    >
                      <LikerAvatar
                        photoUrl={u.photo_url}
                        name={u.name}
                        size={MOBILE_AVATAR}
                        service={u.service}
                        isEmployer={u.is_employer}
                      />
                    </button>
                  );
                })}
                {mobileAvatarExtra > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: CRT.greenDim,
                      fontSize: 11,
                      fontFamily: CRT.mono,
                      flexShrink: 0,
                    }}
                  >
                    +{mobileAvatarExtra}
                  </span>
                )}
              </div>
            )}
            {namePopupUser && (
              <div
                role="status"
                style={{
                  position: "absolute",
                  left: 14,
                  top: "calc(100% - 2px)",
                  zIndex: 50,
                  border: CRT.border,
                  background: "#001400",
                  color: namePopupUser.color,
                  fontFamily: CRT.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  padding: "6px 10px",
                  boxShadow: `0 0 12px ${CRT.greenFaint}`,
                  maxWidth: "min(280px, calc(100% - 28px))",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                &lt;{namePopupUser.handle}&gt;
                <span style={{ color: CRT.greenDim, fontWeight: 500, marginLeft: 8 }}>
                  {namePopupUser.name}
                </span>
              </div>
            )}
          </div>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(140px, 200px)",
            gap: 0,
          }}
          className="chatroom-crt-grid"
        >
          <style>{`
            @media (max-width: 720px) {
              .chatroom-crt-grid { grid-template-columns: 1fr !important; }
              .chatroom-crt-sidebar { display: none !important; }
              .chatroom-crt-mobile-online { display: flex !important; }
            }
          `}</style>

          <div
            style={{
              position: "relative",
              minHeight: 0,
              overflowY: "auto",
              padding: "14px 16px",
              borderRight: CRT.border,
            }}
          >
            {/* Crest watermark */}
            <div
              aria-hidden
              style={{
                pointerEvents: "none",
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.08,
                zIndex: 0,
              }}
            >
              <div style={{ textAlign: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/eod-crab-logo.png"
                  alt=""
                  width={220}
                  height={220}
                  style={{
                    width: 220,
                    height: 220,
                    objectFit: "contain",
                    filter: "grayscale(1) brightness(1.4)",
                  }}
                />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1 }}>
              {loading && messages.length === 0 && (
                <div style={{ color: CRT.greenDim, fontSize: 13 }}>
                  &gt;&gt; CONNECTING TO LOBBY…
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div style={{ color: CRT.greenDim, fontSize: 13, lineHeight: 1.6 }}>
                  &gt;&gt; NO TRAFFIC YET, JUMP IN.
                </div>
              )}

              {messages.map((m) => {
                const color = handleColor(m.user_id);
                const handle = terminalHandle(m.author_name);
                return (
                  <div
                    key={m.id}
                    style={{
                      marginBottom: 10,
                      fontSize: 13,
                      lineHeight: 1.55,
                      wordBreak: "break-word",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                      <span style={{ color: CRT.greenDim }}>[{formatTerminalTime(m.created_at)}]</span>
                      <span style={{ color, fontWeight: 700 }}>&lt;{handle}&gt;</span>
                      <span style={{ color: CRT.text, whiteSpace: "pre-wrap", flex: "1 1 180px" }}>
                        {renderChatBody(m.body)}
                      </span>
                      <button
                        type="button"
                        aria-label="Message actions"
                        onClick={() => setMenuForId((id) => (id === m.id ? null : m.id))}
                        style={{
                          ...btnBase,
                          border: "none",
                          color: CRT.greenMuted,
                          padding: "0 4px",
                          fontSize: 12,
                        }}
                      >
                        ···
                      </button>
                    </div>

                    {menuForId === m.id && (
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          flexWrap: "wrap",
                          alignItems: "center",
                          border: CRT.border,
                          padding: "4px 8px",
                          marginTop: 4,
                          background: "#001400",
                        }}
                      >
                        {m.user_id !== currentUserId ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReportForId(m.id);
                                setMenuForId(null);
                              }}
                              style={{ ...btnBase, border: "none", fontSize: 11, padding: 0 }}
                            >
                              REPORT
                            </button>
                            <HideBlockUserButton
                              targetUserId={m.user_id}
                              currentUserId={currentUserId}
                              context="chatroom"
                              t={{
                                text: CRT.green,
                                textMuted: CRT.greenDim,
                                textFaint: CRT.greenMuted,
                                border: CRT.green,
                                surface: "#001400",
                              }}
                              compact
                              onBlocked={(blockedId) => {
                                setMessages((prev) => prev.filter((row) => row.user_id !== blockedId));
                                setMenuForId(null);
                              }}
                            />
                          </>
                        ) : (
                          <span style={{ color: CRT.greenDim, fontSize: 11 }}>YOUR MSG</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          <aside
            className="chatroom-crt-sidebar"
            style={{
              minHeight: 0,
              overflowY: "auto",
              padding: "12px 12px 16px",
              background: "#000800",
            }}
          >
            <div
              style={{
                color: CRT.green,
                fontSize: 12,
                letterSpacing: 1,
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              ONLINE ({onlineUserIds.length})
            </div>
            {onlinePreview.length === 0 ? (
              <div style={{ color: CRT.greenDim, fontSize: 12 }}>No presence signal</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {onlinePreview.map((u) => (
                  <li key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: CRT.green,
                        boxShadow: `0 0 6px ${CRT.green}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: u.color, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.handle}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {onlineExtra > 0 && (
              <div style={{ marginTop: 12, color: CRT.greenDim, fontSize: 11 }}>
                … and {onlineExtra} more
              </div>
            )}
          </aside>
        </div>

        <footer
          style={{
            flexShrink: 0,
            borderTop: CRT.border,
            padding: "10px 12px 12px",
            background: "#000a00",
          }}
        >
          {error && (
            <div style={{ color: CRT.danger, fontSize: 12, marginBottom: 8 }}>
              !! {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                border: CRT.border,
                padding: "8px 10px",
                background: "#000",
                minWidth: 0,
              }}
            >
              <span style={{ color: CRT.green, fontWeight: 700, lineHeight: "22px" }}>&gt;&gt;</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MentionTextarea
                  ref={inputRef}
                  value={draft}
                  onChange={(display) => setDraft(display.slice(0, CHATROOM_MESSAGE_MAX_LEN))}
                  onChangeRaw={(raw) => {
                    draftRawRef.current = raw;
                  }}
                  placeholder="Type your message here... (@ to tag)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  style={{
                    width: "100%",
                    resize: "none",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: CRT.text,
                    fontFamily: CRT.mono,
                    fontSize: 13,
                    lineHeight: 1.45,
                    padding: 0,
                    caretColor: CRT.green,
                    minHeight: 44,
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void sendMessage()}
              style={{
                ...btnBase,
                flexShrink: 0,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 700,
                opacity: sending || !draft.trim() ? 0.4 : 1,
                cursor: sending || !draft.trim() ? "not-allowed" : "pointer",
                boxShadow: sending || !draft.trim() ? "none" : `0 0 10px ${CRT.greenFaint}`,
              }}
            >
              SEND
            </button>
          </div>
          <div style={{ fontSize: 10, color: CRT.greenMuted, marginTop: 6, textAlign: "right" }}>
            {draft.length}/{CHATROOM_MESSAGE_MAX_LEN}
          </div>
        </footer>
      </div>

      {warningBannerDismissed ? (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            style={{
              ...btnBase,
              border: CRT.borderAmber,
              color: CRT.amber,
              padding: "4px 8px",
              fontSize: 10,
            }}
          >
            [ RULES ]
          </button>
        </div>
      ) : (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: CRT.borderAmber,
            padding: "8px 10px",
            background: "#100800",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              color: CRT.amber,
              fontSize: "clamp(10px, 2.4vw, 12px)",
              letterSpacing: 0.4,
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span aria-hidden style={{ fontSize: 14 }}>
              ▲
            </span>
            <span>
              Nothing&apos;s saved. Messages self-destruct after 24 hours.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            style={{
              ...btnBase,
              border: CRT.borderAmber,
              color: CRT.amber,
              padding: "6px 10px",
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            RULES & GUIDELINES
          </button>
          <button
            type="button"
            aria-label="Dismiss warning banner"
            onClick={() => {
              dismissChatroomWarningBannerForSession();
              setWarningBannerDismissed(true);
            }}
            style={{
              ...btnBase,
              border: CRT.borderAmber,
              color: CRT.amber,
              width: 28,
              height: 28,
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {reportForId && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily: CRT.mono,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              background: "#001000",
              border: CRT.border,
              padding: 16,
            }}
          >
            <div style={{ color: CRT.green, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
              REPORT MESSAGE
            </div>
            <div style={{ color: CRT.greenDim, fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>
              Choose a reason. A copy is saved for admins even after the message expires.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FLAG_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  disabled={reporting}
                  onClick={() => void reportMessage(reportForId, cat)}
                  style={{
                    ...btnBase,
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: 12,
                    opacity: reporting ? 0.5 : 1,
                  }}
                >
                  &gt; {FLAG_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReportForId(null)}
              style={{
                ...btnBase,
                marginTop: 12,
                width: "100%",
                padding: "10px 12px",
                color: CRT.greenDim,
                borderColor: CRT.greenMuted,
                fontSize: 12,
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {rulesOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily: CRT.mono,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#100800",
              border: CRT.borderAmber,
              padding: 16,
            }}
          >
            <div style={{ color: CRT.amber, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
              RULES & GUIDELINES
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, color: CRT.amber, fontSize: 12, lineHeight: 1.7 }}>
              {RULES_COPY.map((line) => (
                <li key={line} style={{ marginBottom: 4 }}>
                  {line}
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setRulesOpen(false)}
              style={{
                ...btnBase,
                marginTop: 14,
                width: "100%",
                padding: "10px 12px",
                border: CRT.borderAmber,
                color: CRT.amber,
                fontSize: 12,
              }}
            >
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
