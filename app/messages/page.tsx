"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";

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

export default function MessagesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [inboxTab, setInboxTab] = useState<"messages" | "requests">("messages");
  const bottomRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
      await loadConversations(user.id);
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

  async function loadConversations(uid: string) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, participant_1, participant_2, last_message_at, status, initiated_by")
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
      .neq("status", "declined")
      .order("last_message_at", { ascending: false });

    if (error || !data) return;

    const otherIds = data.map((c) => c.participant_1 === uid ? c.participant_2 : c.participant_1);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url, account_type")
      .in("user_id", otherIds);

    const profileMap = new Map((profiles ?? []).map((p: {
      user_id: string; first_name: string | null; last_name: string | null;
      display_name: string | null; photo_url: string | null; account_type: string | null;
    }) => [p.user_id, p]));

    // Only fetch message previews/unread for accepted conversations
    const acceptedIds = data.filter((c) => c.status === "accepted").map((c) => c.id);
    const unreadMap = new Map<string, number>();
    const previewMap = new Map<string, string>();

    if (acceptedIds.length > 0) {
      const { data: msgData } = await supabase
        .from("messages")
        .select("conversation_id, content, is_read, sender_id, created_at")
        .in("conversation_id", acceptedIds)
        .order("created_at", { ascending: false });

      (msgData ?? []).forEach((m: { conversation_id: string; content: string; is_read: boolean; sender_id: string }) => {
        if (!previewMap.has(m.conversation_id)) {
          previewMap.set(m.conversation_id, m.content);
        }
        if (m.sender_id !== uid && !m.is_read) {
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
      // If I received a request from them, switch to requests tab
      if (existing.status === "pending" && existing.initiated_by !== userId) {
        setInboxTab("requests");
      } else {
        selectConversation(existing.id);
        if (isMobile) setMobileView("thread");
      }
      await loadConversations(userId);
      return;
    }

    // Create new pending request
    const { data: created } = await supabase
      .from("conversations")
      .insert({ participant_1: p1, participant_2: p2, status: "pending", initiated_by: userId })
      .select("id")
      .single();

    await loadConversations(userId);

    if (created?.id) {
      selectConversation(created.id);
      if (isMobile) setMobileView("thread");
    }
  }

  async function acceptRequest(convId: string) {
    await supabase.from("conversations").update({ status: "accepted" }).eq("id", convId);
    if (userId) await loadConversations(userId);
    selectConversation(convId);
    setInboxTab("messages");
    if (isMobile) setMobileView("thread");
  }

  async function declineRequest(convId: string) {
    await supabase.from("conversations").update({ status: "declined" }).eq("id", convId);
    if (userId) await loadConversations(userId);
  }

  async function cancelRequest(convId: string) {
    await supabase.from("conversations").delete().eq("id", convId);
    setActiveConvId(null);
    if (userId) await loadConversations(userId);
    if (isMobile) setMobileView("list");
  }

  async function selectConversation(convId: string) {
    setActiveConvId(convId);
    await loadMessages(convId);
    markConversationRead(convId);
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
    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", convId)
      .neq("sender_id", userId)
      .eq("is_read", false);
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
        setMessages((prev) => [...prev, msg]);
        if (msg.sender_id !== userId) {
          supabase.from("messages").update({ is_read: true }).eq("id", msg.id);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => { if (realtimeRef.current) supabase.removeChannel(realtimeRef.current); };
  }, []);

  async function sendMessage() {
    if (!newMessage.trim() || !activeConvId || !userId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage("");
    await supabase.from("messages").insert({ conversation_id: activeConvId, sender_id: userId, content });
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", activeConvId);
    setSending(false);
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const acceptedConvs = conversations.filter((c) => c.status === "accepted");
  const sentPending = conversations.filter((c) => c.status === "pending" && c.initiated_by === userId);
  const receivedRequests = conversations.filter((c) => c.status === "pending" && c.initiated_by !== userId);
  const totalUnread = acceptedConvs.reduce((sum, c) => sum + c.unread_count, 0);

  const avatarStyle = (name: string, photo: string | null, size = 40): React.CSSProperties => ({
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    background: photo ? "transparent" : "black",
    color: "white", fontWeight: 700, fontSize: size * 0.4,
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  });

  if (loading) return <div style={{ padding: 40 }}><NavBar /></div>;

  const InboxPane = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderRight: isMobile ? "none" : "1px solid #e5e7eb" }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
        <button
          onClick={() => setInboxTab("messages")}
          style={{
            flex: 1, padding: "14px 8px", fontWeight: 800, fontSize: 14, cursor: "pointer",
            border: "none", borderBottom: inboxTab === "messages" ? "2px solid black" : "2px solid transparent",
            background: "white", color: inboxTab === "messages" ? "black" : "#888",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          Messages
          {totalUnread > 0 && (
            <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
              {totalUnread}
            </span>
          )}
        </button>
        <button
          onClick={() => setInboxTab("requests")}
          style={{
            flex: 1, padding: "14px 8px", fontWeight: 800, fontSize: 14, cursor: "pointer",
            border: "none", borderBottom: inboxTab === "requests" ? "2px solid black" : "2px solid transparent",
            background: "white", color: inboxTab === "requests" ? "black" : "#888",
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
            {acceptedConvs.length === 0 && sentPending.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 14 }}>
                No conversations yet. Visit someone&apos;s profile to start a DM.
              </div>
            )}
            {/* Accepted conversations */}
            {acceptedConvs.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                  cursor: "pointer", borderBottom: "1px solid #f3f4f6",
                  background: activeConvId === conv.id ? "#f9fafb" : "white",
                }}
                onMouseEnter={(e) => { if (activeConvId !== conv.id) e.currentTarget.style.background = "#fafafa"; }}
                onMouseLeave={(e) => { if (activeConvId !== conv.id) e.currentTarget.style.background = "white"; }}
              >
                <div style={avatarStyle(conv.other_user_name, conv.other_user_photo)}>
                  {conv.other_user_photo
                    ? <img src={conv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : conv.other_user_name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: conv.unread_count > 0 ? 800 : 600, fontSize: 14 }}>{conv.other_user_name}</span>
                    <span style={{ fontSize: 11, color: "#999", flexShrink: 0 }}>{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <div style={{ fontSize: 13, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      {conv.last_message_preview ?? "Start a conversation"}
                    </div>
                    {conv.unread_count > 0 && (
                      <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>
                        {conv.unread_count}
                      </span>
                    )}
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
                  cursor: "pointer", borderBottom: "1px solid #f3f4f6",
                  background: activeConvId === conv.id ? "#f9fafb" : "white", opacity: 0.7,
                }}
              >
                <div style={avatarStyle(conv.other_user_name, conv.other_user_photo)}>
                  {conv.other_user_photo
                    ? <img src={conv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : conv.other_user_name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{conv.other_user_name}</span>
                    <span style={{ background: "#fef9c3", color: "#92400e", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>Pending</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>Request sent</div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* REQUESTS TAB */}
        {inboxTab === "requests" && (
          <>
            {receivedRequests.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 14 }}>
                No pending requests.
              </div>
            )}
            {receivedRequests.map((conv) => {
              const isEmployer = conv.other_user_account_type === "employer";
              return (
                <div key={conv.id} style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={avatarStyle(conv.other_user_name, conv.other_user_photo)}>
                      {conv.other_user_photo
                        ? <img src={conv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : conv.other_user_name[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{conv.other_user_name}</span>
                        {isEmployer && (
                          <span style={{ background: "#dbeafe", color: "#1d4ed8", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>EMPLOYER</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
                        {isEmployer
                          ? "An employer wants to send you a message."
                          : "wants to send you a message."}
                      </div>
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{timeAgo(conv.last_message_at)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => acceptRequest(conv.id)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "black", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(conv.id)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #d1d5db", background: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
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

  const ThreadPane = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Thread header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
        {isMobile && (
          <button onClick={() => setMobileView("list")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 18, padding: "0 4px 0 0", color: "#444" }}>
            ←
          </button>
        )}
        {activeConv ? (
          <>
            <div style={avatarStyle(activeConv.other_user_name, activeConv.other_user_photo)}>
              {activeConv.other_user_photo
                ? <img src={activeConv.other_user_photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : activeConv.other_user_name[0]?.toUpperCase()}
            </div>
            <a href={`/profile/${activeConv.other_user_id}`} style={{ fontWeight: 800, fontSize: 16, textDecoration: "none", color: "inherit" }}>
              {activeConv.other_user_name}
            </a>
            {isPendingSent && (
              <span style={{ marginLeft: "auto", background: "#fef9c3", color: "#92400e", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20 }}>
                Request Pending
              </span>
            )}
          </>
        ) : (
          <span style={{ color: "#888", fontSize: 14 }}>Select a conversation</span>
        )}
      </div>

      {/* Pending sent state */}
      {isPendingSent ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef9c3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>⏳</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Request sent to {activeConv?.other_user_name}</div>
          <div style={{ fontSize: 14, color: "#666", maxWidth: 280, lineHeight: 1.6 }}>
            Your message request is waiting to be accepted. You&apos;ll be able to chat once they accept.
          </div>
          <button
            onClick={() => activeConvId && cancelRequest(activeConvId)}
            style={{ padding: "9px 20px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#ef4444" }}
          >
            Cancel Request
          </button>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {!activeConvId && (
              <div style={{ margin: "auto", color: "#aaa", fontSize: 14, textAlign: "center" }}>
                Select a conversation or start a new one from someone&apos;s profile.
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === userId;
              return (
                <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "72%", padding: "10px 14px",
                    borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: isMe ? "black" : "#f3f4f6",
                    color: isMe ? "white" : "black",
                    fontSize: 14, lineHeight: 1.5,
                  }}>
                    {msg.content}
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: isMe ? "right" : "left" }}>
                      {timeAgo(msg.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {activeConvId && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10 }}>
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type a message..."
                style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
                style={{ padding: "10px 18px", borderRadius: 20, border: "none", background: "black", color: "white", fontWeight: 700, cursor: "pointer", opacity: !newMessage.trim() || sending ? 0.5 : 1 }}
              >
                Send
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <NavBar />
      <div style={{
        border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden", background: "white",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "320px 1fr",
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
  );
}
