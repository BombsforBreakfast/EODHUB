"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import NavBar from "../../components/NavBar";

// ─── Types ───────────────────────────────────────────────────────────────────

type Unit = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_url: string | null;
  type: string;
  created_by: string;
  member_count: number;
};

type Membership = {
  role: "owner" | "admin" | "member";
  status: "pending" | "approved";
};

type UnitPost = {
  id: string;
  user_id: string;
  content: string | null;
  photo_url: string | null;
  post_type: "post" | "join_request";
  meta: { requester_id: string; requester_name: string; avatar_url: string | null } | null;
  created_at: string;
  author_name: string;
  author_photo: string | null;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
  approval_count?: number;
  user_voted?: boolean;
};

type Comment = {
  id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_photo: string | null;
};

type Member = {
  user_id: string;
  role: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
  job_title: string | null;
};

type InviteUser = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
};

const BRANCHES = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal"];

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function displayName(user: { display_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Member";
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function UnitPage() {
  const { t, isDark } = useTheme();
  const params = useParams();
  const slug = params.slug as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"wall" | "members" | "photos">("wall");

  // Wall
  const [posts, setPosts] = useState<UnitPost[]>([]);
  const [postInput, setPostInput] = useState("");
  const [postPhotoUrl, setPostPhotoUrl] = useState("");
  const [postPhotoPreview, setPostPhotoPreview] = useState<string | null>(null);
  const [postPhotoFile, setPostPhotoFile] = useState<File | null>(null);
  const postPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Members
  const [members, setMembers] = useState<Member[]>([]);

  // Join
  const [joining, setJoining] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsers, setInviteUsers] = useState<InviteUser[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteBranches, setInviteBranches] = useState<Set<string>>(new Set());
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const inviteLoadedRef = useRef(false);

  // ── Auth + initial load ──────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      await loadUnit(uid, session?.access_token ?? null);
    }
    init();
  }, [slug]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadUnit(uid: string | null, token: string | null) {
    setLoading(true);
    try {
      const res = await fetch(`/api/units/${slug}`);
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      const json = await res.json();
      setUnit(json.unit);

      if (uid && token) {
        const { data: prof } = await supabase.from("profiles").select("is_admin").eq("user_id", uid).maybeSingle();
        const appAdm = prof?.is_admin === true;
        setIsAppAdmin(appAdm);

        const { data: mem } = await supabase
          .from("unit_members")
          .select("role, status")
          .eq("unit_id", json.unit.id)
          .eq("user_id", uid)
          .maybeSingle();
        setMembership(mem as Membership | null);

        if (mem?.status === "approved" || appAdm) {
          await loadPosts(token);
        }
      } else {
        setIsAppAdmin(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadPosts(token?: string) {
    const t = token ?? (await getToken());
    const res = await fetch(`/api/units/${slug}/posts`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const json = await res.json();
      setPosts(json.posts ?? []);
    }
  }

  async function loadMembers() {
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setMembers(json.members ?? []);
    }
  }

  useEffect(() => {
    const wallOk = membership?.status === "approved" || isAppAdmin;
    if (activeTab === "members" && wallOk && members.length === 0) {
      loadMembers();
    }
  }, [activeTab, membership, isAppAdmin]);

  // ── Join ─────────────────────────────────────────────────────────────────

  async function requestJoin() {
    if (!currentUserId) { window.location.href = "/login"; return; }
    setJoining(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMembership({ role: "member", status: "pending" });
      }
    } finally {
      setJoining(false);
    }
  }

  // ── Approvals ────────────────────────────────────────────────────────────

  async function handleApproval(requesterUserId: string, action: "vote" | "approve" | "deny") {
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requester_user_id: requesterUserId, action }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.result === "approved" || json.result === "denied") {
        // Remove the join_request post from state
        setPosts((prev) => prev.filter((p) => !(p.post_type === "join_request" && p.user_id === requesterUserId)));
      } else if (json.result === "voted") {
        // Update the approval count in state
        setPosts((prev) =>
          prev.map((p) =>
            p.post_type === "join_request" && p.user_id === requesterUserId
              ? { ...p, approval_count: json.votes, user_voted: true }
              : p
          )
        );
      }
    }
  }

  // ── Wall posts ───────────────────────────────────────────────────────────

  async function uploadUnitPhoto(file: File): Promise<string> {
    const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const filePath = `unit-posts/${safeFileName}`;
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
  }

  async function submitPost() {
    if (!postInput.trim() && !postPhotoFile && !postPhotoUrl.trim()) return;
    setSubmittingPost(true);
    try {
      let finalPhotoUrl = postPhotoUrl.trim() || null;
      if (postPhotoFile) {
        finalPhotoUrl = await uploadUnitPhoto(postPhotoFile);
      }
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: postInput.trim() || null, photo_url: finalPhotoUrl }),
      });
      if (res.ok) {
        setPostInput("");
        setPostPhotoFile(null);
        setPostPhotoPreview(null);
        if (postPhotoInputRef.current) postPhotoInputRef.current.value = "";
        setPostPhotoUrl("");
        await loadPosts();
      }
    } finally {
      setSubmittingPost(false);
    }
  }

  async function toggleLike(postId: string) {
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, user_liked: json.liked, like_count: json.like_count } : p
        )
      );
    }
  }

  async function toggleComments(postId: string) {
    if (expandedComments.has(postId)) {
      setExpandedComments((prev) => { const s = new Set(prev); s.delete(postId); return s; });
      return;
    }
    setExpandedComments((prev) => new Set(prev).add(postId));
    if (!comments[postId]) {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setComments((prev) => ({ ...prev, [postId]: json.comments ?? [] }));
      }
    }
  }

  async function submitComment(postId: string) {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      const json = await res.json();
      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), json.comment] }));
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p));
    }
  }

  // ── Invite ───────────────────────────────────────────────────────────────

  async function openInviteModal() {
    setShowInvite(true);
    setInviteMsg(null);
    if (!inviteLoadedRef.current) {
      inviteLoadedRef.current = true;
      // Load all users except existing members
      const [{ data: allProfiles }, { data: existingMembers }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, first_name, last_name, photo_url, service").order("first_name"),
        supabase.from("unit_members").select("user_id").eq("unit_id", unit!.id),
      ]);
      const memberIds = new Set((existingMembers ?? []).map((m: { user_id: string }) => m.user_id));
      setInviteUsers((allProfiles ?? []).filter((p: InviteUser) => !memberIds.has(p.user_id)) as InviteUser[]);
    }
  }

  async function sendInvites() {
    if (selectedInvites.size === 0) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_ids: Array.from(selectedInvites) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send invites");
      setInviteMsg(`${json.invited} member${json.invited === 1 ? "" : "s"} added successfully.`);
      setSelectedInvites(new Set());
      inviteLoadedRef.current = false;
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setInviting(false);
    }
  }

  const filteredInviteUsers = inviteUsers.filter((u) => {
    const name = displayName(u).toLowerCase();
    const matchesQuery = !inviteQuery.trim() || name.includes(inviteQuery.toLowerCase());
    const matchesBranch = inviteBranches.size === 0 || (u.service && inviteBranches.has(u.service));
    return matchesQuery && matchesBranch;
  });

  // ── Styles ───────────────────────────────────────────────────────────────

  const wallAccess = membership?.status === "approved" || isAppAdmin;
  const isGod =
    isAppAdmin ||
    (membership?.status === "approved" && (membership.role === "owner" || membership.role === "admin"));
  const photos = posts.filter((p) => p.photo_url && p.post_type === "post");

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    background: t.input,
    color: t.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
          <NavBar />
          <div style={{ color: t.textMuted, textAlign: "center", padding: 60 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (notFound || !unit) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
          <NavBar />
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Unit not found</div>
            <a href="/units" style={{ color: "#3b82f6", fontWeight: 700, fontSize: 14 }}>← Back to Units</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
        <NavBar />

        {/* Back */}
        <a href="/units" style={{ color: t.textMuted, fontSize: 13, fontWeight: 700, textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
          ← Units
        </a>

        {/* Cover + Header */}
        <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${t.border}`, background: t.surface, marginBottom: 20 }}>
          <div style={{ height: 140, background: unit.cover_photo_url ? `url(${unit.cover_photo_url}) center/cover` : (isDark ? "#1a1a2e" : "#1e3a5f") }} />
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{unit.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: isDark ? "#1a1a2e" : "#dbeafe", color: isDark ? "#93c5fd" : "#1d4ed8", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {unit.type.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                    {unit.member_count} {unit.member_count === 1 ? "member" : "members"}
                  </span>
                </div>
                {unit.description && (
                  <div style={{ marginTop: 10, fontSize: 14, color: t.textMuted, lineHeight: 1.6, maxWidth: 540 }}>{unit.description}</div>
                )}
              </div>

              {/* Join / Status / Invite buttons */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                {!currentUserId && (
                  <a href="/login" style={{ background: "#111", color: "#fff", textDecoration: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13 }}>
                    Log in to join
                  </a>
                )}
                {currentUserId && !membership && !isAppAdmin && (
                  <button onClick={requestJoin} disabled={joining} style={{ background: joining ? t.badgeBg : "#111", color: joining ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {joining && <span className="btn-spinner btn-spinner-dark" />}
                    Request to Join
                  </button>
                )}
                {isAppAdmin && (
                  <span style={{ background: isDark ? "#3d2a00" : "#fef3c7", color: "#92400e", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 800 }}>
                    App admin — full unit access
                  </span>
                )}
                {membership?.status === "pending" && !isAppAdmin && (
                  <div style={{ background: isDark ? "#2a2a00" : "#fef9c3", color: "#854d0e", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700 }}>
                    Request pending
                  </div>
                )}
                {wallAccess && isGod && (
                  <button onClick={openInviteModal} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    Invite Members
                  </button>
                )}
                {wallAccess && !isGod && (
                  <button onClick={openInviteModal} style={{ background: t.badgeBg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Invite
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Non-member gate */}
        {!wallAccess && (
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 28, background: t.surface, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              {membership?.status === "pending" ? "Your request is pending" : "Members Only"}
            </div>
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6 }}>
              {membership?.status === "pending"
                ? "Once 3 members vouch for you, you'll be automatically approved. An admin can also approve you directly."
                : "Request to join to see the wall, members, and photos."}
            </div>
          </div>
        )}

        {/* Member view: tabs */}
        {wallAccess && (
          <>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${t.border}`, paddingBottom: 0 }}>
              {(["wall", "members", "photos"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: activeTab === tab ? "3px solid #111" : "3px solid transparent",
                    color: activeTab === tab ? t.text : t.textMuted,
                    fontWeight: activeTab === tab ? 800 : 600,
                    fontSize: 14,
                    padding: "10px 16px",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* WALL TAB */}
            {activeTab === "wall" && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Post composer */}
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                  <textarea
                    value={postInput}
                    onChange={(e) => setPostInput(e.target.value)}
                    placeholder="Post to the unit wall..."
                    rows={3}
                    style={{ ...inputStyle, resize: "none", marginBottom: 10 }}
                  />
                  {postPhotoPreview && (
                    <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
                      <img src={postPhotoPreview} alt="preview" style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 8, objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={() => { setPostPhotoPreview(null); setPostPhotoFile(null); if (postPhotoInputRef.current) postPhotoInputRef.current.value = ""; }}
                        style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                      >×</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      ref={postPhotoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPostPhotoFile(file);
                        setPostPhotoPreview(URL.createObjectURL(file));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => postPhotoInputRef.current?.click()}
                      style={{ ...inputStyle, flex: 1, textAlign: "left", cursor: "pointer", color: postPhotoFile ? t.text : t.textMuted, background: t.input }}
                    >
                      {postPhotoFile ? postPhotoFile.name : "📷 Add Photo (optional)"}
                    </button>
                    <button
                      onClick={submitPost}
                      disabled={submittingPost || (!postInput.trim() && !postPhotoFile)}
                      style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {submittingPost && <span className="btn-spinner" />}
                      Post
                    </button>
                  </div>
                </div>

                {/* Posts */}
                {posts.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40, fontSize: 14 }}>No posts yet. Be the first to post.</div>
                )}

                {posts.map((post) => {
                  if (post.post_type === "join_request") {
                    return (
                      <JoinRequestCard
                        key={post.id}
                        post={post}
                        isGod={isGod}
                        currentUserId={currentUserId!}
                        onVote={() => handleApproval(post.user_id, "vote")}
                        onApprove={() => handleApproval(post.user_id, "approve")}
                        onDeny={() => handleApproval(post.user_id, "deny")}
                        t={t}
                        isDark={isDark}
                      />
                    );
                  }
                  return (
                    <PostCard
                      key={post.id}
                      post={post}
                      t={t}
                      comments={comments[post.id]}
                      commentInput={commentInputs[post.id] ?? ""}
                      onCommentInputChange={(v) => setCommentInputs((prev) => ({ ...prev, [post.id]: v }))}
                      expanded={expandedComments.has(post.id)}
                      onToggleLike={() => toggleLike(post.id)}
                      onToggleComments={() => toggleComments(post.id)}
                      onSubmitComment={() => submitComment(post.id)}
                    />
                  );
                })}
              </div>
            )}

            {/* MEMBERS TAB */}
            {activeTab === "members" && (
              <div>
                {members.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40 }}>Loading members...</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {members.map((m) => {
                    const name = displayName(m);
                    const initial = (name[0] || "?").toUpperCase();
                    return (
                      <a
                        key={m.user_id}
                        href={`/profile/${m.user_id}`}
                        style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, textDecoration: "none", color: t.text }}
                      >
                        {m.photo_url ? (
                          <img src={m.photo_url} alt={name} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{initial}</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                          {m.service && <div style={{ fontSize: 12, color: t.textMuted }}>{m.service}</div>}
                          {m.role !== "member" && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.role}</div>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PHOTOS TAB */}
            {activeTab === "photos" && (
              <div>
                {photos.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40 }}>No photos shared yet.</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                  {photos.map((p) => (
                    <div key={p.id} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden" }}>
                      <img src={p.photo_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setShowInvite(false); setInviteMsg(null); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}
        >
          <div style={{ background: t.surface, borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", border: `1px solid ${t.border}` }}>
            {/* Modal header */}
            <div style={{ padding: "20px 20px 12px", borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
                Invite Members to {unit.name}
              </div>

              {/* Branch filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {BRANCHES.map((branch) => {
                  const active = inviteBranches.has(branch);
                  return (
                    <button
                      key={branch}
                      onClick={() => setInviteBranches((prev) => {
                        const s = new Set(prev);
                        active ? s.delete(branch) : s.add(branch);
                        return s;
                      })}
                      style={{ background: active ? "#111" : t.badgeBg, color: active ? "#fff" : t.text, border: `1px solid ${active ? "#111" : t.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      {branch}
                    </button>
                  );
                })}
                {inviteBranches.size > 0 && (
                  <button onClick={() => setInviteBranches(new Set())} style={{ background: "none", border: "none", color: t.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>

              {/* Name search */}
              <input
                type="text"
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
                placeholder="Search by name..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* User list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {filteredInviteUsers.length === 0 && (
                <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: 24 }}>No matching users found.</div>
              )}
              {filteredInviteUsers.map((u) => {
                const name = displayName(u);
                const checked = selectedInvites.has(u.user_id);
                return (
                  <div
                    key={u.user_id}
                    onClick={() => setSelectedInvites((prev) => {
                      const s = new Set(prev);
                      checked ? s.delete(u.user_id) : s.add(u.user_id);
                      return s;
                    })}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", background: checked ? (isDark ? "#1a2a1a" : "#f0fdf4") : "transparent" }}
                    onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = t.surfaceHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = checked ? (isDark ? "#1a2a1a" : "#f0fdf4") : "transparent"; }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? "#22c55e" : t.border}`, background: checked ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {checked && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
                    </div>
                    {u.photo_url ? (
                      <img src={u.photo_url} alt={name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                        {(name[0] || "?").toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                      {u.service && <div style={{ fontSize: 12, color: t.textMuted }}>{u.service}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                {selectedInvites.size > 0 ? `${selectedInvites.size} selected` : "Select members to invite"}
              </div>
              {inviteMsg && (
                <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>{inviteMsg}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowInvite(false); setInviteMsg(null); }} style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Close
                </button>
                <button
                  onClick={sendInvites}
                  disabled={selectedInvites.size === 0 || inviting}
                  style={{ background: selectedInvites.size === 0 ? t.badgeBg : "#111", color: selectedInvites.size === 0 ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: selectedInvites.size === 0 ? "not-allowed" : "pointer" }}
                >
                  {inviting ? "Inviting..." : `Invite${selectedInvites.size > 0 ? ` (${selectedInvites.size})` : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type ThemeTokens = {
  surface: string; border: string; text: string; textMuted: string; textFaint: string;
  badgeBg: string; input: string; inputBorder: string; surfaceHover: string; borderLight: string;
  bg: string; badgeText: string; navBg: string; navBorder: string;
};

function Avatar({ photo, name, size = 38 }: { photo: string | null; name: string; size?: number }) {
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.4, flexShrink: 0 }}>
      {(name[0] || "?").toUpperCase()}
    </div>
  );
}

function JoinRequestCard({ post, isGod, currentUserId, onVote, onApprove, onDeny, t, isDark }: {
  post: UnitPost; isGod: boolean; currentUserId: string;
  onVote: () => void; onApprove: () => void; onDeny: () => void;
  t: ThemeTokens; isDark: boolean;
}) {
  const [voting, setVoting] = useState(false);
  const [acting, setActing] = useState<"approve" | "deny" | null>(null);
  const approvalCount = post.approval_count ?? 0;
  const isRequester = post.user_id === currentUserId;

  return (
    <div style={{ border: `1px solid ${isDark ? "#2a2a00" : "#fef08a"}`, borderRadius: 14, padding: 16, background: isDark ? "#1a1a00" : "#fefce8", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <Avatar photo={post.meta?.avatar_url ?? post.author_photo} name={post.author_name} size={42} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{post.content}</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{timeAgo(post.created_at)}</div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Vote progress */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < approvalCount ? "#22c55e" : (isDark ? "#2e2e2e" : "#e5e7eb") }} />
            ))}
            <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 4, fontWeight: 600 }}>{approvalCount}/3 approved</span>
          </div>

          {!isRequester && (
            <>
              {!post.user_voted && (
                <button
                  disabled={voting}
                  onClick={async () => { setVoting(true); try { await Promise.resolve(onVote()); } finally { setVoting(false); } }}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: voting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  {voting && <span className="btn-spinner" />}
                  Vouch
                </button>
              )}
              {post.user_voted && (
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>✓ Vouched</span>
              )}
              {isGod && (
                <>
                  <button
                    disabled={acting === "approve"}
                    onClick={async () => { setActing("approve"); try { await Promise.resolve(onApprove()); } finally { setActing(null); } }}
                    style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: acting === "approve" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    {acting === "approve" && <span className="btn-spinner" />}
                    Approve
                  </button>
                  <button
                    disabled={acting === "deny"}
                    onClick={async () => { setActing("deny"); try { await Promise.resolve(onDeny()); } finally { setActing(null); } }}
                    style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: acting === "deny" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    {acting === "deny" && <span className="btn-spinner" />}
                    Deny
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, t, comments, commentInput, onCommentInputChange, expanded, onToggleLike, onToggleComments, onSubmitComment }: {
  post: UnitPost; t: ThemeTokens;
  comments: Comment[] | undefined;
  commentInput: string;
  onCommentInputChange: (v: string) => void;
  expanded: boolean;
  onToggleLike: () => void;
  onToggleComments: () => void;
  onSubmitComment: () => void;
}) {
  const [submittingComment, setSubmittingComment] = useState(false);
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <Avatar photo={post.author_photo} name={post.author_name} size={38} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{post.author_name}</div>
          <div style={{ fontSize: 12, color: t.textMuted }}>{timeAgo(post.created_at)}</div>
        </div>
      </div>

      {post.content && (
        <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: post.photo_url ? 12 : 0, color: t.text }}>{post.content}</div>
      )}

      {post.photo_url && (
        <img src={post.photo_url} alt="" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 400, marginBottom: 0 }} />
      )}

      {/* Like / Comment bar */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.borderLight}` }}>
        <button
          onClick={onToggleLike}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: post.user_liked ? "#ef4444" : t.textMuted, padding: 0 }}
        >
          <span style={{ fontSize: 15 }}>{post.user_liked ? "❤️" : "🤍"}</span>
          {post.like_count > 0 && post.like_count}
        </button>
        <button
          onClick={onToggleComments}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: t.textMuted, padding: 0 }}
        >
          💬 {post.comment_count > 0 ? post.comment_count : "Comment"}
        </button>
      </div>

      {/* Comments */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.borderLight}` }}>
          {(comments ?? []).length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 10 }}>No comments yet.</div>
          )}
          {(comments ?? []).map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <Avatar photo={c.author_photo} name={c.author_name} size={28} />
              <div style={{ background: t.badgeBg, borderRadius: 10, padding: "7px 12px", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{c.author_name}</div>
                <div style={{ fontSize: 13, color: t.text }}>{c.content}</div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              value={commentInput}
              onChange={(e) => onCommentInputChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSubmitComment()}
              placeholder="Write a comment..."
              style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 13, outline: "none" }}
            />
            <button
              disabled={submittingComment}
              onClick={async () => { setSubmittingComment(true); try { await Promise.resolve(onSubmitComment()); } finally { setSubmittingComment(false); } }}
              style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: submittingComment ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              {submittingComment && <span className="btn-spinner" />}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
