"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import UrlPreviewCard from "./UrlPreviewCard";
import { extractFirstUrl, type UrlPreview } from "../lib/urlPreview";
import { uploadMessagePhoto } from "../lib/messagePhotoUpload";
import { handlePasteImageFromClipboard } from "../lib/pasteImageFromClipboard";
import { mobileComposerBottomOffset, useVisualViewportKeyboardInset } from "../hooks/useVisualViewportKeyboardInset";
import { scrollMessagesToBottom } from "../lib/messageScroll";

const URL_RENDER_RE = /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/g;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  gif_url: string | null;
  image_url: string | null;
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
  const [selectedPhoto, setSelectedPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [urlPreviews, setUrlPreviews] = useState<Record<string, UrlPreview | null>>({});
  const previewFetchesRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [mobileComposerPinned, setMobileComposerPinned] = useState(false);
  const [composerBarHeight, setComposerBarHeight] = useState(72);
  const mobileKeyboardInset = useVisualViewportKeyboardInset(isMobile && mobileComposerPinned && open);

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
        .select("id, conversation_id, sender_id, content, created_at, gif_url, image_url, is_read")
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
              if (prev.some((m) => m.id === msg.id)) return prev;
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

  useLayoutEffect(() => {
    if (!open || loading || messages.length === 0) return;
    const convSwitched = prevConversationIdRef.current !== conversationId;
    prevConversationIdRef.current = conversationId;
    scrollMessagesToBottom(listRef.current, { force: convSwitched });
    if (!convSwitched) return;
    const timer = window.setTimeout(() => {
      scrollMessagesToBottom(listRef.current, { force: true });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, loading, conversationId, messages]);

  useLayoutEffect(() => {
    if (!isMobile || !mobileComposerPinned || !composerRef.current) return;
    const el = composerRef.current;
    const syncHeight = () => setComposerBarHeight(el.getBoundingClientRect().height);
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, mobileComposerPinned, draft, selectedPhoto]);

  useLayoutEffect(() => {
    if (!open || !conversationId) return;
    scrollMessagesToBottom(listRef.current);
  }, [open, conversationId, urlPreviews]);

  useEffect(() => {
    if (!open) {
      setMobileComposerPinned(false);
      prevConversationIdRef.current = null;
    }
  }, [open]);

  function handleMessageImageLoad() {
    scrollMessagesToBottom(listRef.current);
  }

  function handleMobileComposerFocus() {
    if (!isMobile) return;
    setMobileComposerPinned(true);
    scrollMessagesToBottom(listRef.current, { force: true });
  }

  function handleMobileComposerBlur() {
    if (!isMobile) return;
    window.setTimeout(() => setMobileComposerPinned(false), 150);
  }

  const mobileComposerBottom = mobileComposerBottomOffset(mobileKeyboardInset);

  const mobileComposerPinnedStyle: CSSProperties | undefined =
    isMobile && mobileComposerPinned ? { bottom: mobileComposerBottom } : undefined;

  useEffect(() => {
    return () => {
      if (selectedPhoto) URL.revokeObjectURL(selectedPhoto.previewUrl);
    };
  }, [selectedPhoto]);

  function setMessagePhoto(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Please choose a photo.");
      return;
    }
    setSelectedPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  function clearMessagePhoto() {
    setSelectedPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function handlePhotoDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingPhoto(false);
    if (!conversationId || sending) return;
    const image = Array.from(e.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (image) setMessagePhoto(image);
  }

  function handleMessagePhotoPaste(e: ClipboardEvent) {
    if (!conversationId || sending) return;
    handlePasteImageFromClipboard(e, (files) => {
      if (files[0]) setMessagePhoto(files[0]);
    }, { imagesOnly: true });
  }

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
    const photo = selectedPhoto;
    if ((!text && !photo) || !conversationId || sending) return;
    setSending(true);
    setDraft("");
    if (photo) clearMessagePhoto();
    try {
      const imageUrl = photo
        ? await uploadMessagePhoto(supabase, photo.file, { userId: currentUserId, conversationId })
        : null;
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: MessageRow = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: text,
        created_at: new Date().toISOString(),
        gif_url: null,
        image_url: imageUrl,
      };
      setMessages((prev) => [...prev, optimistic]);
      const { data: inserted } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: text,
          gif_url: null,
          image_url: imageUrl,
        })
        .select("id, conversation_id, sender_id, content, created_at, gif_url, image_url, is_read")
        .single();
      if (inserted) {
        setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? (inserted as MessageRow) : msg)));
      }
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send your message.");
      setDraft(text);
      if (photo) setMessagePhoto(photo.file);
    } finally {
      setSending(false);
    }
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

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 14,
          paddingBottom: isMobile && mobileComposerPinned ? composerBarHeight + mobileComposerBottom + 14 : undefined,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
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
              {m.image_url ? (
                <a
                  href={m.image_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "block", marginTop: m.content ? 8 : 0 }}
                >
                  <img
                    src={m.image_url}
                    alt="Message attachment"
                    onLoad={handleMessageImageLoad}
                    style={{ display: "block", maxWidth: 240, maxHeight: 300, borderRadius: 12, objectFit: "cover" }}
                  />
                </a>
              ) : null}
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
        <div ref={bottomRef} />
      </div>

      <div
        ref={composerRef}
        onDragOver={(e) => {
          if (isMobile) return;
          e.preventDefault();
          setIsDraggingPhoto(true);
        }}
        onDragLeave={() => setIsDraggingPhoto(false)}
        onDrop={handlePhotoDrop}
        className={[
          isMobile ? "sidebar-composer-wrap sidebar-composer-wrap--mobile" : "",
          isMobile && mobileComposerPinned ? "sidebar-composer-wrap--keyboard-pinned" : "",
        ].filter(Boolean).join(" ") || undefined}
        style={{
          padding: 12,
          borderTop: `1px solid ${isDraggingPhoto ? "#60a5fa" : t.border}`,
          flexShrink: 0,
          background: isDraggingPhoto ? (isDark ? "rgba(96,165,250,0.12)" : "rgba(96,165,250,0.1)") : t.surface,
          ...mobileComposerPinnedStyle,
        }}
      >
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setMessagePhoto(file);
            e.currentTarget.value = "";
          }}
          style={{ display: "none" }}
        />
        {selectedPhoto && (
          <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
            <img src={selectedPhoto.previewUrl} alt="Selected attachment" style={{ maxHeight: 130, maxWidth: 220, borderRadius: 10, display: "block" }} />
            <button
              type="button"
              onClick={clearMessagePhoto}
              style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
          </div>
        )}
        {isDraggingPhoto && !isMobile && (
          <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 10, border: "1px dashed #60a5fa", color: "#60a5fa", fontSize: 12, fontWeight: 800 }}>
            Drop photo to attach
          </div>
        )}
        <div className={isMobile ? "sidebar-composer-row" : undefined} style={{ display: "flex", gap: 8, width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={handleMobileComposerFocus}
            onBlur={handleMobileComposerBlur}
            onPaste={handleMessagePhotoPaste}
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
              minWidth: 0,
              boxSizing: "border-box",
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
            onClick={() => photoInputRef.current?.click()}
            disabled={sending || loading}
            title="Add photo"
            style={{
              border: `1px solid ${t.border}`,
              background: t.surface,
              color: t.text,
              borderRadius: 10,
              width: 40,
              fontWeight: 900,
              cursor: sending || loading ? "not-allowed" : "pointer",
              opacity: sending || loading ? 0.7 : 1,
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={(!draft.trim() && !selectedPhoto) || !conversationId || sending || loading}
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
