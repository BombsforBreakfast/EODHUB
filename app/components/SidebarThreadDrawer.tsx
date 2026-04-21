"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import UrlPreviewCard from "./UrlPreviewCard";
import { extractFirstUrl, type UrlPreview } from "../lib/urlPreview";

const URL_RENDER_RE = /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/g;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  gif_url: string | null;
  is_read?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  peerUserId: string | null;
  modalOnDesktop?: boolean;
};

export default function SidebarThreadDrawer({ open, onClose, currentUserId, peerUserId, modalOnDesktop = false }: Props) {
  const { t, isDark } = useTheme();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [peerName, setPeerName] = useState("Member");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [urlPreviews, setUrlPreviews] = useState<Record<string, UrlPreview | null>>({});
  const previewFetchesRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!open || !peerUserId) return;

    let cancelled = false;
    async function boot() {
      setLoading(true);
      setConversationId(null);
      setMessages([]);

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, display_name")
        .eq("user_id", peerUserId)
        .maybeSingle();
      const p = profile as { first_name: string | null; last_name: string | null; display_name: string | null } | null;
      const name =
        p?.display_name?.trim() ||
        `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
        "Member";
      if (!cancelled) setPeerName(name);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/sidebar/ensure-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ other_user_id: peerUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.conversation_id) {
        setLoading(false);
        return;
      }
      const cid = json.conversation_id as string;
      if (cancelled) return;
      setConversationId(cid);

      const { data: msgs } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, gif_url, is_read")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: true });
      if (!cancelled) setMessages((msgs ?? []) as MessageRow[]);

      await fetch("/api/mark-messages-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: cid }),
      });

      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = supabase
        .channel(`sidebar-drawer-${cid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${cid}` },
          (payload) => {
            const msg = payload.new as MessageRow;
            setMessages((prev) => {
              const stripped = prev.filter(
                (m) => !(m.id.startsWith("optimistic-") && m.sender_id === msg.sender_id && m.content === msg.content),
              );
              if (stripped.some((m) => m.id === msg.id)) return stripped;
              return [...stripped, msg];
            });
            if (msg.sender_id !== currentUserId) {
              supabase.auth.getSession().then(({ data: { session: s } }) => {
                if (s?.access_token) {
                  void fetch("/api/mark-messages-read", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${s.access_token}`,
                    },
                    body: JSON.stringify({ conversation_id: cid }),
                  });
                }
              });
            }
          },
        )
        .subscribe();

      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }

    void boot();
    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [open, peerUserId, currentUserId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function ensurePreview(url: string) {
    if (!url || previewFetchesRef.current.has(url) || Object.prototype.hasOwnProperty.call(urlPreviews, url)) return;
    previewFetchesRef.current.add(url);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/preview-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        setUrlPreviews((prev) => ({ ...prev, [url]: null }));
        return;
      }
      const data = await res.json();
      const hasPreview = data?.title || data?.description || data?.image;
      setUrlPreviews((prev) => ({
        ...prev,
        [url]: hasPreview
          ? {
              url,
              title: data.title ?? null,
              description: data.description ?? null,
              image: data.image ?? null,
              siteName: data.siteName ?? null,
            }
          : null,
      }));
    } catch {
      setUrlPreviews((prev) => ({ ...prev, [url]: null }));
    }
  }

  useEffect(() => {
    const urls = new Set<string>();
    messages.forEach((msg) => {
      const u = extractFirstUrl(msg.content || "");
      if (u) urls.add(u);
    });
    const draftUrl = extractFirstUrl(draft);
    if (draftUrl) urls.add(draftUrl);
    urls.forEach((u) => {
      void ensurePreview(u);
    });
  }, [messages, draft]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send() {
    const text = draft.trim();
    if (!text || !conversationId || sending) return;
    setSending(true);
    setDraft("");
    const optimistic: MessageRow = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: text,
      created_at: new Date().toISOString(),
      gif_url: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: text,
      gif_url: null,
    });
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    setSending(false);
  }

  function renderMessageTextWithLinks(text: string) {
    const parts: React.ReactNode[] = [];
    const re = new RegExp(URL_RENDER_RE.source, "g");
    let lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      const raw = match[0].replace(/[.,)>]+$/, "");
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      parts.push(
        <a
          key={`drawer-msg-url-${match.index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {raw}
        </a>,
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }

  if (!open || !peerUserId) return null;

  const backdrop = (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: isMobile ? t.bg : "rgba(0,0,0,0.35)",
      }}
    />
  );

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sidebar conversation"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        zIndex: 2001,
        ...(isMobile
          ? { inset: 0, display: "flex", flexDirection: "column", background: t.surface }
          : modalOnDesktop
          ? {
              top: "6vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(980px, calc(100vw - 36px))",
              height: "88vh",
              boxShadow: isDark ? "0 24px 60px rgba(0,0,0,0.6)" : "0 24px 60px rgba(0,0,0,0.22)",
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              background: t.surface,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }
          : {
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(420px, 100vw - 24px)",
              boxShadow: isDark ? "-8px 0 32px rgba(0,0,0,0.45)" : "-8px 0 32px rgba(0,0,0,0.12)",
              borderLeft: `1px solid ${t.border}`,
              background: t.surface,
              display: "flex",
              flexDirection: "column",
            }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16, color: t.text }}>{peerName}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Sidebar"
          style={{
            border: `1px solid ${t.border}`,
            background: t.bg,
            borderRadius: 10,
            width: 36,
            height: 36,
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            color: t.text,
          }}
        >
          ×
        </button>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <div style={{ color: t.textMuted, fontSize: 14 }}>Loading…</div>}
        {!loading && messages.length === 0 && (
          <div style={{ color: t.textFaint, fontSize: 14 }}>No messages yet. Say hi below.</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: extractFirstUrl(m.content || "") ? "76%" : "88%",
                padding: "8px 12px",
                borderRadius: 12,
                background: mine ? (isDark ? "#1e3a5f" : "#111") : t.badgeBg,
                color: mine ? "#fff" : t.text,
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {m.content ? <div>{renderMessageTextWithLinks(m.content)}</div> : null}
              {m.content && (() => {
                const url = extractFirstUrl(m.content);
                const preview = url ? urlPreviews[url] : null;
                return preview ? (
                  <UrlPreviewCard
                    preview={preview}
                    borderColor={mine ? "rgba(255,255,255,0.25)" : t.border}
                    bgColor={mine ? "rgba(255,255,255,0.06)" : t.surface}
                    titleColor={mine ? "#fff" : t.text}
                    mutedTextColor={mine ? "rgba(255,255,255,0.75)" : t.textMuted}
                    compact
                  />
                ) : null;
              })()}
            </div>
          );
        })}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message…"
            disabled={!conversationId || loading}
            style={{
              flex: 1,
              border: `1px solid ${t.inputBorder}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
              background: t.input,
              color: t.text,
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || !conversationId || sending || loading}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "0 16px",
              fontWeight: 800,
              background: "#111",
              color: "#fff",
              cursor: sending || loading ? "not-allowed" : "pointer",
              opacity: sending || loading ? 0.7 : 1,
            }}
          >
            Send
          </button>
        </div>
        {(() => {
          const url = extractFirstUrl(draft);
          const preview = url ? urlPreviews[url] : null;
          return preview ? (
            <UrlPreviewCard
              preview={preview}
              borderColor={t.border}
              bgColor={t.surface}
              titleColor={t.text}
              mutedTextColor={t.textMuted}
              compact
            />
          ) : null;
        })()}
      </div>
    </div>
  );

  return (
    <>
      {backdrop}
      {panel}
    </>
  );
}
