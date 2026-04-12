"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import EmojiPickerButton from "../components/EmojiPickerButton";
import GifPickerButton from "../components/GifPickerButton";
import MemberPaywallModal from "../components/MemberPaywallModal";
import { useMemberSubscriptionGate } from "../hooks/useMemberSubscriptionGate";
import { postNotifyJson } from "../lib/postNotifyClient";

type Conversation = {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string;
  status: string;
  initiated_by: string | null;
  other_user_id: string;
  other_user_name: string;
  other_user_photo: string | null;
  other_user_account_type: string | null;
  unread_count: number;
  last_message_preview: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  gif_url: string | null;
};

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export default function SidebarPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [inboxTab, setInboxTab] = useState<"messages" | "requests">("messages");
  const [requestTarget, setRequestTarget] = useState<{ userId: string; name: string; photo: string | null } | null>(null);
  const [requestDraft, setRequestDraft] = useState("");
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editGifUrl, setEditGifUrl] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const { t, isDark } = useTheme();
  const { blockIfNeeded, paywallOpen, setPaywallOpen } = useMemberSubscriptionGate();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const n = profile as { first_name: string | null; last_name: string | null; display_name: string | null } | null;
      setMyName(n?.display_name || `${n?.first_name ?? ""} ${n?.last_name ?? ""}`.trim() || "Someone");
      const convs = await loadConversations(user.id);
      // Auto-show Requests tab if there are pending requests and no ?with= pre-selects a thread
      const params = new URLSearchParams(window.location.search);
      if (!params.get("with")) {
        const hasRequests = convs.some(c => c.status === "pending" && c.initiated_by !== user.id);
        if (hasRequests) setInboxTab("requests");
      }
      setLoading(false);
    }
    init();
  }, []);

  // Auto-open conversation from ?with= param
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const withUserId = params.get("with");
    if (withUserId) openOrCreateConversation(withUserId);
  }, [userId]);

  async function loadConversations(uid: string): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, participant_1, participant_2, last_message_at, status, initiated_by")
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
      .neq("status", "declined")
      .order("last_message_at", { ascending: false });

    if (error || !data) return [];

    const otherIds = data.map((c) => c.participant_1 === uid ? c.participant_2 : c.participant_1);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url, account_type")
      .in("user_id", otherIds);

    const profileMap = new Map((profiles ?? []).map((p: {
      user_id: string; first_name: string | null; last_name: string | null;
      display_name: string | null; photo_url: string | null; account_type: string | null;
    }) => [p.user_id, p]));

    const acceptedIds = new Set(data.filter((c) => c.status === "accepted").map((c) => c.id));
    const allIds = data.map((c) => c.id);
    const unreadMap = new Map<string, number>();
    const previewMap = new Map<string, string>();

    if (allIds.length > 0) {
      const { data: msgData } = await supabase
        .from("messages")
        .select("conversation_id, content, is_read, sender_id, created_at")
        .in("conversation_id", allIds)
        .order("created_at", { ascending: false });

      (msgData ?? []).forEach((m: { conversation_id: string; content: string; is_read: boolean; sender_id: string }) => {
        if (!previewMap.has(m.conversation_id)) {
          previewMap.set(m.conversation_id, m.content);
        }
        if (acceptedIds.has(m.conversation_id) && m.sender_id !== uid && !m.is_read) {
          unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) ?? 0) + 1);
        }
      });
    }

    const convs: Conversation[] = data.map((c) => {
      const otherId = c.participant_1 === uid ? c.participant_2 : c.participant_1;
      const profile = profileMap.get(otherId);
      const name = profile?.display_name ||
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "EOD Member";
      return {
        ...c,
        other_user_id: otherId,
        other_user_name: name,
        other_user_photo: profile?.photo_url ?? null,
        other_user_account_type: profile?.account_type ?? null,
        unread_count: unreadMap.get(c.id) ?? 0,
        last_message_preview: previewMap.get(c.id) ?? null,
      };
    });

    setConversations(convs);
    return convs;
  }

  async function openOrCreateConversation(otherId: string) {
    if (!userId) return;
    const p1 = userId < otherId ? userId : otherId;
    const p2 = userId < otherId ? otherId : userId;

    const { data: existing } = await supabase
      .from("conversations")
      .select("id, status, initiated_by")
      .eq("participant_1", p1)
      .eq("participant_2", p2)
      .neq("status", "declined")
      .maybeSingle();

    if (existing) {
      if (existing.status === "pending" && existing.initiated_by !== userId) {
        setInboxTab("requests");
      } else {
        selectConversation(existing.id);
        if (isMobile) setMobileView("thread");
      }
      await loadConversations(userId);
      return;
    }

    // New conversation — show compose area, don't auto-create yet
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, display_name, photo_url")
      .eq("user_id", otherId)
      .maybeSingle();
    const p = profile as { first_name: string | null; last_name: string | null; display_name: string | null; photo_url: string | null } | null;
    const name = p?.display_name || `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "EOD Member";
    setRequestTarget({ userId: otherId, name, photo: p?.photo_url ?? null });
    setActiveConvId(null);
    if (isMobile) setMobileView("thread");
  }

  async function sendRequest() {
    if (!userId || !requestTarget || !requestDraft.trim() || sending) return;
    if (blockIfNeeded()) return;
    const otherId = requestTarget.userId;
    const p1 = userId < otherId ? userId : otherId;
    const p2 = userId < otherId ? otherId : userId;
    setSending(true);
    try {
      const { data: created, error: convErr } = await supabase
        .from("conversations")
        .insert({ participant_1: p1, participant_2: p2, status: "pending", initiated_by: userId, last_message_at: new Date().toISOString() })
        .select("id")
        .single();
      if (convErr || !created?.id) {
        alert("Failed to send message request. Please try again.");
        return;
      }
      const { error: msgErr } = await supabase.from("messages").insert({ conversation_id: created.id, sender_id: userId, content: requestDraft.trim() });
      if (msgErr) {
        alert("Message failed to send. Please try again.");
        return;
      }
      await postNotifyJson(supabase, {
        user_id: otherId,
        actor_name: myName,
        post_owner_id: userId,
        type: "message_request",
        category: "message",
        entity_type: "thread",
        entity_id: created.id,
        message: `${myName} sent you a message request`,
        link: "/sidebar",
        group_key: `thread:${created.id}:messages`,
        dedupe_key: `message_request:${created.id}:${otherId}`,
        metadata: { conversation_id: created.id },
      });
      setRequestTarget(null);
      setRequestDraft("");
      await loadConversations(userId);
      selectConversation(created.id);
    } finally {
      setSending(false);
    }
  }

  async function acceptRequest(convId: string) {
    if (blockIfNeeded()) return;
    const { error } = await supabase.from("conversations").update({ status: "accepted" }).eq("id", convId);
    if (error) { alert("Failed to accept request. Please try again."); return; }
    if (userId) await loadConversations(userId);
    selectConversation(convId);
    setInboxTab("messages");
    if (isMobile) setMobileView("thread");
  }

  async function declineRequest(convId: string) {
    if (blockIfNeeded()) return;
    const { error } = await supabase.from("conversations").update({ status: "declined" }).eq("id", convId);
    if (error) { alert("Failed to decline request. Please try again."); return; }
    if (userId) await loadConversations(userId);
  }

  async function cancelRequest(convId: string) {
    if (blockIfNeeded()) return;
    await supabase.from("conversations").delete().eq("id", convId);
    setActiveConvId(null);
    if (userId) await loadConversations(userId);
    if (isMobile) setMobileView("list");
  }

  async function selectConversation(convId: string) {
    setActiveConvId(convId);
    await loadMessages(convId);
    await markConversationRead(convId);
    subscribeToMessages(convId);
    if (isMobile) setMobileView("thread");
  }

  async function loadMessages(convId: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  }

  async function markConversationRead(convId: string) {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch("/api/mark-messages-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: convId }),
      });
    }
    setConversations((prev) =>
      prev.map((c) => c.id === convId ? { ...c, unread_count: 0 } : c)
    );
  }

  function subscribeToMessages(convId: string) {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    realtimeRef.current = supabase
      .channel(`messages-${convId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${convId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => {
          // Remove any optimistic message with same content/sender before adding real one
          const filtered = prev.filter((m) => !(m.id.startsWith("optimistic-") && m.content === msg.content && m.sender_id === msg.sender_id));
          return [...filtered, msg];
        });
        if (msg.sender_id !== userId) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.access_token) {
              void fetch("/api/mark-messages-read", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ conversation_id: convId }),
              });
            }
          });
        }
        setConversations((prev) =>
          prev.map((c) => c.id === convId
            ? { ...c, last_message_preview: msg.content, last_message_at: msg.created_at }
            : c)
        );
      })
      .subscribe();
  }

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => { if (realtimeRef.current) supabase.removeChannel(realtimeRef.current); };
  }, []);

  async function sendMessage() {
    const gif = selectedGifUrl;
    if (!newMessage.trim() && !gif) return;
    if (!activeConvId || !userId || sending) return;
    if (blockIfNeeded()) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");
    setSelectedGifUrl(null);
    // Optimistic update — show immediately without waiting for DB
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: activeConvId,
      sender_id: userId,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
      gif_url: gif ?? null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    const { data: insertedMessage } = await supabase
      .from("messages")
      .insert({ conversation_id: activeConvId, sender_id: userId, content, gif_url: gif ?? null })
      .select("id")
      .single();
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", activeConvId);
    if (activeConv?.other_user_id) {
      await postNotifyJson(supabase, {
        user_id: activeConv.other_user_id,
        actor_name: myName,
        post_owner_id: userId,
        type: "message_received",
        category: "message",
        entity_type: "thread",
        entity_id: activeConvId,
        parent_entity_type: "message",
        parent_entity_id: insertedMessage?.id ?? null,
        message: `${myName} sent you a message`,
        link: "/sidebar",
        group_key: `thread:${activeConvId}:messages`,
        dedupe_key: insertedMessage?.id ? `message_received:${insertedMessage.id}` : null,
        metadata: { conversation_id: activeConvId },
      });
    }
    setSending(false);
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const acceptedConvs = conversations.filter((c) => c.status === "accepted");
  const sentPending = conversations.filter((c) => c.status === "pending" && c.initiated_by === userId);
  const receivedRequests = conversations.filter((c) => c.status === "pending" && c.initiated_by !== userId);
  const avatarStyle = (name: string, photo: string | null, size = 40): React.CSSProperties => ({
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    background: photo ? "transparent" : "#111",
    color: "white", fontWeight: 700, fontSize: size * 0.4,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  });

  if (loading) return <div style={{ padding: 40, background: t.bg, minHeight: "100vh" }}><NavBar /></div>;

  const InboxPane = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, borderRight: isMobile ? "none" : `1px solid ${t.border}` }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${t.border}` }}>
        <button
          onClick={() => setInboxTab("messages")}
          style={{
            flex: 1, padding: "14px 8px", fontWeight: 800, fontSize: 14, cursor: "pointer",
            border: "none", borderBottom: inboxTab === "messages" ? `2px solid ${t.text}` : "2px solid transparent",
            background: t.surface, color: inboxTab === "messages" ? t.text : t.textFaint,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          Inbox
        </button>
        <button
          onClick={() => setInboxTab("requests")}
          style={{
            flex: 1, padding: "14px 8px", fontWeight: 800, fontSize: 14, cursor: "pointer",
            border: "none", borderBottom: inboxTab === "requests" ? `2px solid ${t.text}` : "2px solid transparent",
            background: t.surface, color: inboxTab === "requests" ? t.text : t.textFaint,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          Requests
          {receivedRequests.length > 0 && (
            <span style={{ background: "#ef4444", color: "white", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
              {receivedRequests.length}
            </span>
          )}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* MESSAGES TAB */}
        {inboxTab === "messages" && (
          <>
            {/* Nudge banner when requests are waiting */}
            {receivedRequests.length > 0 && (
              <button
                onClick={() => setInboxTab("requests")}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 20px",
                  background: isDark ? "#1c2a1c" : "#f0fdf4",
                  border: "none", borderBottom: `1px solid ${t.border}`,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  fontSize: 13, fontWeight: 700, color: isDark ? "#86efac" : "#166534",
                }}
              >
                📬 {receivedRequests.length} message request{receivedRequests.length !== 1 ? "s" : ""} waiting → View
              </button>
            )}
            {acceptedConvs.length === 0 && sentPending.length === 0 && receivedRequests.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, fontSize: 14 }}>
                No conversations yet. Visit someone&apos;s profile or use Sidebar from a comment thread.
              </div>
            )}
            {acceptedConvs.length === 0 && sentPending.length === 0 && receivedRequests.length > 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, fontSize: 14 }}>
                Your accepted conversations will appear here.
              </div>
            )}
            {/* Accepted conversations */}
            {acceptedConvs.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                  cursor: "pointer", borderBottom: `1px solid ${t.border}`,
                  background: activeConvId === conv.id ? t.surfaceHover : t.surface,
                }}
                onMouseEnter={(e) => { if (activeConvId !== conv.id) e.currentTarget.style.background = t.surfaceHover; }}
                onMouseLeave={(e) => { if (activeConvId !== conv.id) e.currentTarget.style.background = t.surface; }}
              >
                <div
                  style={{ width: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                  aria-hidden
                >
                  {conv.unread_count > 0 ? (
                    <span
                      title="Unread"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#fbbf24",
                        flexShrink: 0,
                        boxShadow: isDark ? "0 0 0 1px rgba(0,0,0,0.35)" : undefined,
                      }}
                    />
                  ) : null}
                </div>
                <a href={`/profile/${conv.other_user_id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", flexShrink: 0 }}>
                  <div style={avatarStyle(conv.other_user_name, conv.other_user_photo)}>
                    {conv.other_user_photo
                      ? <img src={conv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : conv.other_user_name[0]?.toUpperCase()}
                  </div>
                </a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: conv.unread_count > 0 ? 800 : 600, fontSize: 14, color: t.text }}>{conv.other_user_name}</span>
                    <span style={{ fontSize: 11, color: t.textFaint, flexShrink: 0 }}>{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {conv.last_message_preview ?? "Start a conversation"}
                  </div>
                </div>
              </div>
            ))}
            {/* Sent pending requests */}
            {sentPending.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                  cursor: "pointer", borderBottom: `1px solid ${t.border}`,
                  background: activeConvId === conv.id ? t.surfaceHover : t.surface, opacity: 0.7,
                }}
              >
                <a href={`/profile/${conv.other_user_id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none", flexShrink: 0 }}>
                  <div style={avatarStyle(conv.other_user_name, conv.other_user_photo)}>
                    {conv.other_user_photo
                      ? <img src={conv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : conv.other_user_name[0]?.toUpperCase()}
                  </div>
                </a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{conv.other_user_name}</span>
                    <span style={{ background: "#fef9c3", color: "#92400e", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>Pending</span>
                  </div>
                  <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {conv.last_message_preview ?? "Request sent"}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* REQUESTS TAB */}
        {inboxTab === "requests" && (
          <>
            {receivedRequests.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: t.textFaint, fontSize: 14 }}>
                No pending requests.
              </div>
            )}
            {receivedRequests.map((conv) => {
              const isEmployer = conv.other_user_account_type === "employer";
              return (
                <div key={conv.id} style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <a href={`/profile/${conv.other_user_id}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                      <div style={avatarStyle(conv.other_user_name, conv.other_user_photo)}>
                        {conv.other_user_photo
                          ? <img src={conv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : conv.other_user_name[0]?.toUpperCase()}
                      </div>
                    </a>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{conv.other_user_name}</span>
                        {isEmployer && (
                          <span style={{ background: "#dbeafe", color: "#1d4ed8", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>EMPLOYER</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                        {isEmployer ? "An employer wants to connect." : "wants to send you a message."}
                      </div>
                      {conv.last_message_preview && (
                        <div style={{ fontSize: 13, color: t.text, marginTop: 5, padding: "7px 10px", background: t.bg, borderRadius: 8, fontStyle: "italic", lineHeight: 1.4 }}>
                          &ldquo;{conv.last_message_preview}&rdquo;
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>{timeAgo(conv.last_message_at)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => acceptRequest(conv.id)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "#111", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(conv.id)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  const isPendingSent = activeConv?.status === "pending" && activeConv?.initiated_by === userId;
  const threadName = requestTarget?.name ?? activeConv?.other_user_name ?? null;
  const threadPhoto = requestTarget?.photo ?? activeConv?.other_user_photo ?? null;
  const threadUserId = requestTarget?.userId ?? activeConv?.other_user_id ?? null;

  async function deleteMessage(msgId: string) {
    if (blockIfNeeded()) return;
    setDeletingId(msgId);
    await supabase.from("messages").delete().eq("id", msgId).eq("sender_id", userId!);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setConfirmDeleteId(null);
    setDeletingId(null);
  }

  function startEditMessage(msg: Message) {
    setEditingMsgId(msg.id);
    setEditContent(msg.content);
    setEditGifUrl(msg.gif_url);
    setTimeout(() => editInputRef.current?.focus(), 40);
  }

  async function saveEditMessage() {
    if (!editingMsgId || savingEdit) return;
    if (blockIfNeeded()) return;
    setSavingEdit(true);
    const trimmed = editContent.trim();
    await supabase.from("messages").update({ content: trimmed, gif_url: editGifUrl ?? null }).eq("id", editingMsgId).eq("sender_id", userId!);
    setMessages((prev) => prev.map((m) => m.id === editingMsgId ? { ...m, content: trimmed, gif_url: editGifUrl ?? null } : m));
    setEditingMsgId(null); setEditContent(""); setEditGifUrl(null); setSavingEdit(false);
  }

  async function flagMessage(msg: Message) {
    if (flaggingId || !userId) return;
    if (blockIfNeeded()) return;
    if (!window.confirm("Flag this message for admin review?")) return;
    setFlaggingId(msg.id);
    try {
      await supabase.from("flags").insert([{ reporter_id: userId, content_type: "message", content_id: msg.id, reason: null, reviewed: false }]);
      const { data: admins } = await supabase.from("profiles").select("user_id").eq("is_admin", true);
      if (admins && admins.length > 0) {
        const results = await Promise.all(
          admins.map((a: { user_id: string }) =>
            postNotifyJson(supabase, {
              user_id: a.user_id,
              actor_name: myName,
              type: "activity",
              category: "system",
              message: `Message flagged: "${(msg.content || "[GIF]").slice(0, 60)}"`,
              link: "/admin",
              group_key: `admin:flags:message:${msg.id}`,
              dedupe_key: `admin_flag_message:${msg.id}:${a.user_id}`,
              metadata: { content_type: "message", content_id: msg.id },
            }),
          ),
        );
        const anyOk = results.some((r) => r.ok);
        alert(
          anyOk
            ? "Message flagged. Admins have been notified."
            : "Message flagged, but notifications could not be delivered. Check your connection.",
        );
      } else {
        alert("Message flagged.");
      }
    } finally { setFlaggingId(null); }
  }

  const msgActionBtn = (label: string, color: string, onClick: () => void, disabled?: boolean) => (
    <button onClick={onClick} disabled={disabled} title={label} style={{ background: "none", border: "none", cursor: disabled ? "default" : "pointer", fontSize: 13, color, padding: "2px 6px", borderRadius: 6, lineHeight: 1, opacity: disabled ? 0.4 : 0.7 }}>{label === "Delete" ? "✕" : label === "Edit" ? "✎" : "⚑"}</button>
  );

  const MessageBubbles = (
    <div ref={messagesContainerRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      {messages.map((msg) => {
        const isMe = msg.sender_id === userId;
        const isHovered = hoveredMsgId === msg.id;
        const isEditing = editingMsgId === msg.id;
        const isConfirm = confirmDeleteId === msg.id;
        return (
          <div
            key={msg.id}
            style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}
            onMouseEnter={() => setHoveredMsgId(msg.id)}
            onMouseLeave={() => setHoveredMsgId(null)}
          >
            {/* Action buttons — shown on hover */}
            {isHovered && !isEditing && !isConfirm && (
              <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                {isMe && msgActionBtn("Delete", "#ef4444", () => setConfirmDeleteId(msg.id))}
                {isMe && msgActionBtn("Edit", t.textMuted, () => startEditMessage(msg))}
                {msgActionBtn("Flag", t.textMuted, () => flagMessage(msg), !!flaggingId)}
              </div>
            )}

            {/* Confirm delete */}
            {isConfirm && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: t.surface, border: `1px solid #fca5a5`, borderRadius: 10, marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: t.text }}>Delete this message?</span>
                <button onClick={() => deleteMessage(msg.id)} disabled={!!deletingId} style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  {deletingId === msg.id && <span className="btn-spinner" />}
                  Delete
                </button>
                <button onClick={() => setConfirmDeleteId(null)} style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 6, padding: "3px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            )}

            {/* Edit card */}
            {isEditing ? (
              <div style={{ width: "min(360px, 85vw)", background: t.surface, border: `1px solid ${t.inputBorder}`, borderRadius: 14, padding: 12 }}>
                <textarea
                  ref={editInputRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${t.inputBorder}`, borderRadius: 8, padding: "8px 10px", fontSize: 14, resize: "vertical", background: t.input, color: t.text, outline: "none", fontFamily: "inherit" }}
                />
                {editGifUrl && (
                  <div style={{ position: "relative", display: "inline-block", marginTop: 6 }}>
                    <img src={editGifUrl} alt="GIF" style={{ maxHeight: 100, maxWidth: 200, borderRadius: 8, display: "block" }} />
                    <button onClick={() => setEditGifUrl(null)} style={{ position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                  <EmojiPickerButton value={editContent} onChange={setEditContent} inputRef={messageInputRef} theme={isDark ? "dark" : "light"} />
                  <GifPickerButton onSelect={(url) => setEditGifUrl(url)} theme={isDark ? "dark" : "light"} />
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setEditingMsgId(null); setEditContent(""); setEditGifUrl(null); }} style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${t.border}`, background: "transparent", fontWeight: 700, fontSize: 12, cursor: "pointer", color: t.text }}>Cancel</button>
                  <button onClick={saveEditMessage} disabled={savingEdit || (!editContent.trim() && !editGifUrl)} style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: "#111", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, opacity: savingEdit || (!editContent.trim() && !editGifUrl) ? 0.6 : 1 }}>
                    {savingEdit && <span className="btn-spinner" />}Save
                  </button>
                </div>
              </div>
            ) : !isConfirm && (
              <div style={{
                maxWidth: "72%", padding: msg.gif_url && !msg.content ? "4px" : "10px 14px",
                borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: isMe ? "#111" : t.badgeBg,
                color: isMe ? "white" : t.text,
                fontSize: 14, lineHeight: 1.5,
              }}>
                {msg.content && <div>{msg.content}</div>}
                {msg.gif_url && (
                  <div style={{ marginTop: msg.content ? 8 : 0 }}>
                    <img src={msg.gif_url} alt="GIF" style={{ maxWidth: 220, borderRadius: 12, display: "block" }} />
                  </div>
                )}
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: isMe ? "right" : "left" }}>{timeAgo(msg.created_at)}</div>
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );

  const ThreadPane = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Thread header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        {isMobile && (
          <button
            onClick={() => { setMobileView("list"); setRequestTarget(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 18, padding: "0 4px 0 0", color: t.textMuted }}
          >
            ←
          </button>
        )}
        {threadName ? (
          <>
            {threadUserId && !requestTarget ? (
              <a href={`/profile/${threadUserId}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                <div style={avatarStyle(threadName, threadPhoto)}>
                  {threadPhoto
                    ? <img src={threadPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : threadName[0]?.toUpperCase()}
                </div>
              </a>
            ) : (
              <div style={avatarStyle(threadName, threadPhoto)}>
                {threadPhoto
                  ? <img src={threadPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : threadName[0]?.toUpperCase()}
              </div>
            )}
            {threadUserId && !requestTarget ? (
              <a href={`/profile/${threadUserId}`} style={{ fontWeight: 800, fontSize: 16, textDecoration: "none", color: "inherit" }}>
                {threadName}
              </a>
            ) : (
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: t.text }}>{threadName}</div>
                <div style={{ fontSize: 12, color: t.textFaint, marginTop: 1 }}>New message request</div>
              </div>
            )}
            {isPendingSent && (
              <span style={{ marginLeft: "auto", background: "#fef9c3", color: "#92400e", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20 }}>
                Request Pending
              </span>
            )}
          </>
        ) : (
          <span style={{ color: t.textFaint, fontSize: 14 }}>Select a conversation</span>
        )}
      </div>

      {/* Compose new request */}
      {requestTarget ? (
        <>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px", textAlign: "center" }}>
            <div style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 300 }}>
              Your message will be sent as a request.<br />{requestTarget.name} can choose to accept or decline.
            </div>
          </div>
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 10 }}>
            <input
              autoFocus
              value={requestDraft}
              onChange={(e) => setRequestDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && requestDraft.trim()) { e.preventDefault(); sendRequest(); } }}
              placeholder={`Message ${requestTarget.name}...`}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: "none" }}
            />
            <button
              onClick={sendRequest}
              disabled={!requestDraft.trim() || sending}
              style={{ padding: "10px 18px", borderRadius: 20, border: "none", background: "#111", color: "white", fontWeight: 700, cursor: "pointer", opacity: !requestDraft.trim() || sending ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}
            >
              {sending && <span className="btn-spinner" />}
              Send
            </button>
          </div>
        </>
      ) : isPendingSent ? (
        /* Pending sent — show the message they sent + waiting footer */
        <>
          {MessageBubbles}
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
              Waiting for <strong>{activeConv?.other_user_name}</strong> to accept your request.
            </div>
            <button
              onClick={() => activeConvId && cancelRequest(activeConvId)}
              style={{ padding: "7px 16px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, fontWeight: 700, fontSize: 12, cursor: "pointer", color: "#ef4444", flexShrink: 0 }}
            >
              Cancel Request
            </button>
          </div>
        </>
      ) : (
        /* Normal accepted thread */
        <>
          {activeConvId ? MessageBubbles : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ color: t.textFaint, fontSize: 14, textAlign: "center" }}>
                Select a conversation or start a new one from someone&apos;s profile.
              </div>
            </div>
          )}
          {activeConvId && (
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.border}` }}>
              {selectedGifUrl && (
                <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
                  <img src={selectedGifUrl} alt="GIF" style={{ maxHeight: 120, maxWidth: 220, borderRadius: 10, display: "block" }} />
                  <button
                    type="button"
                    onClick={() => setSelectedGifUrl(null)}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >×</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  ref={messageInputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: "none" }}
                />
                <EmojiPickerButton
                  value={newMessage}
                  onChange={setNewMessage}
                  inputRef={messageInputRef}
                  theme={isDark ? "dark" : "light"}
                />
                <GifPickerButton
                  onSelect={(url) => setSelectedGifUrl(url)}
                  theme={isDark ? "dark" : "light"}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={(!newMessage.trim() && !selectedGifUrl) || sending}
                  style={{ padding: "10px 18px", borderRadius: 20, border: "none", background: "#111", color: "white", fontWeight: 700, cursor: "pointer", opacity: (!newMessage.trim() && !selectedGifUrl) || sending ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}
                >
                  {sending && <span className="btn-spinner" />}
                  Send
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div style={{ background: t.bg, height: "100dvh", overflow: "hidden", color: t.text }}>
      <div
        className="sidebar-page-shell"
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: 0,
          boxSizing: "border-box",
          padding: "20px max(20px, env(safe-area-inset-right)) 20px max(20px, env(safe-area-inset-left))",
        }}
      >
        <NavBar />
        <div style={{
          border: `1px solid ${t.border}`, borderRadius: 16, overflow: "hidden", background: t.surface,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
          gridTemplateRows: "1fr",
          height: isMobile ? "calc(100dvh - 120px)" : "calc(100dvh - 140px)",
        }}>
          {isMobile ? (
            mobileView === "list" ? InboxPane : ThreadPane
          ) : (
            <>
              {InboxPane}
              {ThreadPane}
            </>
          )}
        </div>
      </div>
      <MemberPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
