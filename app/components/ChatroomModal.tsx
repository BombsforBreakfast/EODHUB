"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useTheme } from "../lib/ThemeContext";
import { getAccessToken, supabase } from "../lib/lib/supabaseClient";
import {
  CHATROOM_MESSAGE_MAX_LEN,
  CHATROOM_TAG_LABELS,
  CHATROOM_TAGS,
  type ChatroomMessageDto,
  type ChatroomTag,
} from "../lib/chatroom";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../lib/flagCategories";
import { LikerAvatar } from "./PostLikersStack";
import HideBlockUserButton from "./HideBlockUserButton";

type Props = {
  open: boolean;
  currentUserId: string | null;
  onClose: () => void;
};

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ChatroomModal({ open, currentUserId, onClose }: Props) {
  const { t } = useTheme();
  const [messages, setMessages] = useState<ChatroomMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState<ChatroomTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [reportForId, setReportForId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    const channel = supabase
      .channel("chatroom-lobby")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatroom_messages" },
        () => {
          void loadMessages();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatroom_reactions" },
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
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function sendMessage() {
    const text = draft.trim();
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
        body: JSON.stringify({ body: text, tag }),
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
    } finally {
      setSending(false);
    }
  }

  async function react(messageId: string, value: "up" | "down") {
    const token = await getAccessToken({ source: "ChatroomModal.react" });
    if (!token) return;
    const res = await fetch("/api/chatroom/reactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageId, value }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { my_reaction: "up" | "down" | null };
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        let up = m.up_count;
        let down = m.down_count;
        if (m.my_reaction === "up") up -= 1;
        if (m.my_reaction === "down") down -= 1;
        if (body.my_reaction === "up") up += 1;
        if (body.my_reaction === "down") down += 1;
        return { ...m, up_count: Math.max(0, up), down_count: Math.max(0, down), my_reaction: body.my_reaction };
      }),
    );
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
      window.alert("Thanks — this was reported to admins and removed from the room.");
    } finally {
      setReporting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat room"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: t.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          borderBottom: `1px solid ${t.border}`,
          background: t.surface,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: t.text }}>Chat room</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
            Messages disappear after 24 hours. No photos or videos.
          </div>
        </div>
        <button
          type="button"
          aria-label="Close chat room"
          onClick={onClose}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: t.bg,
            color: t.text,
            fontSize: 22,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </header>

      <div
        ref={listRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {loading && messages.length === 0 && (
          <div style={{ color: t.textMuted, fontSize: 13, padding: 12 }}>Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ color: t.textMuted, fontSize: 13, padding: 12, lineHeight: 1.45 }}>
            Nobody’s said anything yet. Say hi — it’s low-commitment.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              border: `1px solid ${t.borderLight ?? t.border}`,
              borderRadius: 12,
              padding: "10px 12px",
              background: t.surface,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <LikerAvatar
                photoUrl={m.author_photo_url}
                name={m.author_name}
                size={34}
                service={m.author_service}
                isEmployer={m.author_is_employer}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: t.text }}>{m.author_name}</span>
                  <span style={{ fontSize: 11, color: t.textFaint }}>{formatTs(m.created_at)}</span>
                  {m.tag && m.tag in CHATROOM_TAG_LABELS && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        color: t.textMuted,
                        border: `1px solid ${t.border}`,
                        borderRadius: 999,
                        padding: "1px 8px",
                      }}
                    >
                      {CHATROOM_TAG_LABELS[m.tag as ChatroomTag]}
                    </span>
                  )}
                  <div style={{ marginLeft: "auto", position: "relative" }}>
                    <button
                      type="button"
                      aria-label="Message actions"
                      onClick={() => setMenuForId((id) => (id === m.id ? null : m.id))}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: t.textMuted,
                        fontWeight: 800,
                        cursor: "pointer",
                        padding: "0 4px",
                      }}
                    >
                      ···
                    </button>
                    {menuForId === m.id && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "100%",
                          zIndex: 2,
                          minWidth: 160,
                          background: t.surface,
                          border: `1px solid ${t.border}`,
                          borderRadius: 10,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
                          padding: 6,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {m.user_id !== currentUserId && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setReportForId(m.id);
                                setMenuForId(null);
                              }}
                              style={{
                                textAlign: "left",
                                background: "transparent",
                                border: "none",
                                padding: "8px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: 12,
                                color: t.text,
                              }}
                            >
                              Report
                            </button>
                            <HideBlockUserButton
                              targetUserId={m.user_id}
                              currentUserId={currentUserId}
                              t={t}
                              compact
                              onBlocked={(blockedId) => {
                                setMessages((prev) => prev.filter((row) => row.user_id !== blockedId));
                                setMenuForId(null);
                              }}
                            />
                          </>
                        )}
                        {m.user_id === currentUserId && (
                          <span style={{ fontSize: 11, color: t.textMuted, padding: "6px 10px" }}>
                            Your message
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 14, color: t.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {m.body}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => void react(m.id, "up")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      border: `1px solid ${m.my_reaction === "up" ? t.text : t.border}`,
                      background: m.my_reaction === "up" ? t.badgeBg : "transparent",
                      borderRadius: 999,
                      padding: "4px 10px",
                      cursor: "pointer",
                      color: t.text,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <ThumbsUp size={13} /> {m.up_count}
                  </button>
                  <button
                    type="button"
                    onClick={() => void react(m.id, "down")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      border: `1px solid ${m.my_reaction === "down" ? t.text : t.border}`,
                      background: m.my_reaction === "down" ? t.badgeBg : "transparent",
                      borderRadius: 999,
                      padding: "4px 10px",
                      cursor: "pointer",
                      color: t.text,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <ThumbsDown size={13} /> {m.down_count}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {reportForId && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 3,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: t.surface,
              borderRadius: 14,
              border: `1px solid ${t.border}`,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 8 }}>Report message</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
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
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: reporting ? "not-allowed" : "pointer",
                  }}
                >
                  {FLAG_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReportForId(null)}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: "transparent",
                color: t.textMuted,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <footer
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${t.border}`,
          background: t.surface,
          padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
        }}
      >
        {error && (
          <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8, fontWeight: 700 }}>{error}</div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {CHATROOM_TAGS.map((chip) => {
            const active = tag === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setTag((prev) => (prev === chip ? null : chip))}
                style={{
                  border: `1px solid ${active ? t.text : t.border}`,
                  background: active ? t.badgeBg : "transparent",
                  color: t.text,
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {CHATROOM_TAG_LABELS[chip]}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, CHATROOM_MESSAGE_MAX_LEN))}
            placeholder="Say something…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            style={{
              flex: 1,
              resize: "none",
              borderRadius: 12,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            type="button"
            disabled={sending || !draft.trim()}
            onClick={() => void sendMessage()}
            style={{
              flexShrink: 0,
              borderRadius: 12,
              border: "none",
              background: t.text,
              color: t.bg,
              fontWeight: 800,
              fontSize: 13,
              padding: "12px 16px",
              cursor: sending || !draft.trim() ? "not-allowed" : "pointer",
              opacity: sending || !draft.trim() ? 0.55 : 1,
            }}
          >
            Send
          </button>
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6, textAlign: "right" }}>
          {draft.length}/{CHATROOM_MESSAGE_MAX_LEN}
        </div>
      </footer>
    </div>
  );
}
