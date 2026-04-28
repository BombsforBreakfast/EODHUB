"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cancelDelayedLikeNotify, scheduleDelayedLikeNotify } from "../../../lib/likeNotifyDelay";
import { postNotifyJson } from "../../../lib/postNotifyClient";
import { supabase } from "../../../lib/lib/supabaseClient";
import { useTheme } from "../../../lib/ThemeContext";
import GifPickerButton from "../../../components/GifPickerButton";
import EmojiPickerButton from "../../../components/EmojiPickerButton";
import { useMasterShell } from "../../../components/master/masterShellContext";
import AddToRabbitholeModal from "../../../rabbithole/components/AddToRabbitholeModal";
import { MurphyRabbitholeBanner } from "../../../components/MurphyRabbitholeBanner";
import FeedPostHeader from "../../../components/FeedPostHeader";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../../../lib/flagCategories";
import { ensureSavedEventForUser } from "../../../lib/ensureSavedEventForUser";

const RABBITHOLE_THRESHOLD_BYPASS = true;

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
  gif_url: string | null;
  post_type: "post" | "join_request" | "photo_album";
  meta: {
    requester_id?: string;
    requester_name?: string;
    avatar_url?: string | null;
    rabbithole_contribution_id?: string;
    og?: {
      url?: string | null;
      title?: string | null;
      description?: string | null;
      site_name?: string | null;
    };
  } | null;
  created_at: string;
  author_name: string;
  author_photo: string | null;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
  approval_count?: number;
  user_voted?: boolean;
  rabbithole_thread_id?: string | null;
  rabbithole_contribution_id?: string | null;
  hidden_for_review?: boolean | null;
};

type Comment = {
  id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_photo: string | null;
  image_url?: string | null;
  gif_url?: string | null;
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

type UnitEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  created_at: string;
  unit_id: string | null;
  visibility: "public" | "group" | string | null;
};

const BRANCHES = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal"];
const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

function isHiddenInviteAccount(user: Pick<InviteUser, "user_id" | "display_name" | "first_name" | "last_name">) {
  const name = `${user.display_name ?? ""} ${user.first_name ?? ""} ${user.last_name ?? ""}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const compactName = name.replace(/[^a-z0-9]/g, "");
  return (
    user.user_id === RUMINT_USER_ID ||
    compactName === "rumint" ||
    compactName === "eodhub" ||
    compactName === "eodhubadmin"
  );
}

function getYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("?")[0];
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

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

function formatEventDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function UnitPage() {
  const { t, isDark } = useTheme();
  const { isDesktopShell } = useMasterShell();
  const params = useParams();
  const slug = params.slug as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"wall" | "events" | "members" | "photos">("wall");

  // Wall
  const [posts, setPosts] = useState<UnitPost[]>([]);
  const postsRef = useRef<UnitPost[]>([]);
  const [postInput, setPostInput] = useState("");
  const [postPhotoUrl, setPostPhotoUrl] = useState("");
  const [postPhotoPreview, setPostPhotoPreview] = useState<string | null>(null);
  const [postPhotoFile, setPostPhotoFile] = useState<File | null>(null);
  const postPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [postGif, setPostGif] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagModal, setFlagModal] = useState<{ contentType: "unit_post"; contentId: string } | null>(null);
  const [flagCategoryChoice, setFlagCategoryChoice] = useState<FlagCategory>("general");

  // Members
  const [members, setMembers] = useState<Member[]>([]);

  // Events
  const [unitEvents, setUnitEvents] = useState<UnitEvent[]>([]);
  const [unitEventsLoaded, setUnitEventsLoaded] = useState(false);
  const [unitEventsLoading, setUnitEventsLoading] = useState(false);
  const [unitEventFormOpen, setUnitEventFormOpen] = useState(false);
  const [unitEventSubmitting, setUnitEventSubmitting] = useState(false);
  const [unitEventForm, setUnitEventForm] = useState({
    title: "",
    date: "",
    event_time: "",
    location: "",
    organization: "",
    description: "",
    signup_url: "",
    poc_name: "",
    poc_phone: "",
  });
  const [unitEventAttendance, setUnitEventAttendance] = useState<Record<string, { interested: number; going: number }>>({});
  const [unitEventMyAttendance, setUnitEventMyAttendance] = useState<Record<string, "interested" | "going" | null>>({});
  const [unitSavedEventIds, setUnitSavedEventIds] = useState<Set<string>>(new Set());
  const [selectedUnitEvent, setSelectedUnitEvent] = useState<UnitEvent | null>(null);

  // Join
  const [joining, setJoining] = useState(false);

  // Rabbithole modal
  const [rabbitholeModalPost, setRabbitholeModalPost] = useState<{ id: string; content: string } | null>(null);

  // Photos tab submission
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoUploadFile, setPhotoUploadFile] = useState<File | null>(null);
  const [photoUploadPreview, setPhotoUploadPreview] = useState<string | null>(null);
  const [submittingPhoto, setSubmittingPhoto] = useState(false);
  const [photoSubmitMsg, setPhotoSubmitMsg] = useState<string | null>(null);
  const photoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPhotoIndex, setGalleryPhotoIndex] = useState<number | null>(null);

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

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 700);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function loadUnit(uid: string | null, token: string | null) {
    setLoading(true);
    try {
      const t = token ?? (await getToken());
      const res = await fetch(`/api/units/${slug}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      const json = await res.json();
      setUnit(json.unit);

      if (uid && token) {
        const { data: mem } = await supabase
          .from("unit_members")
          .select("role, status")
          .eq("unit_id", json.unit.id)
          .eq("user_id", uid)
          .maybeSingle();
        setMembership(mem as Membership | null);

        if (mem?.status === "approved") {
          await loadPosts(token);
        }
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

  async function loadUnitEvents() {
    setUnitEventsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as {
          events?: UnitEvent[];
          attendance?: Record<string, { interested: number; going: number }>;
          myAttendance?: Record<string, "interested" | "going" | null>;
          savedEventIds?: string[];
        };
        setUnitEvents(json.events ?? []);
        setUnitEventAttendance(json.attendance ?? {});
        setUnitEventMyAttendance(json.myAttendance ?? {});
        setUnitSavedEventIds(new Set(json.savedEventIds ?? []));
        setUnitEventsLoaded(true);
      }
    } finally {
      setUnitEventsLoading(false);
    }
  }

  async function createUnitEvent() {
    if (!unitEventForm.title.trim() || !unitEventForm.date || unitEventSubmitting) return;
    setUnitEventSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(unitEventForm),
      });
      const json = await res.json().catch(() => ({})) as { event?: UnitEvent; error?: string };
      if (!res.ok) {
        alert(json.error ?? "Could not create event.");
        return;
      }
      setUnitEventForm({ title: "", date: "", event_time: "", location: "", organization: "", description: "", signup_url: "", poc_name: "", poc_phone: "" });
      setUnitEventFormOpen(false);
      await loadUnitEvents();
    } finally {
      setUnitEventSubmitting(false);
    }
  }

  async function toggleUnitEventAttendance(eventId: string, status: "interested" | "going") {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    const current = unitEventMyAttendance[eventId] ?? null;
    try {
      if (current === status) {
        const { error } = await supabase
          .from("event_attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", currentUserId);
        if (error) throw error;
        await supabase
          .from("saved_events")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", currentUserId);
        setUnitSavedEventIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("event_attendance")
          .upsert([{ event_id: eventId, user_id: currentUserId, status }], { onConflict: "event_id,user_id" });
        if (error) throw error;
        await ensureSavedEventForUser(supabase, currentUserId, eventId);
        setUnitSavedEventIds((prev) => new Set(prev).add(eventId));
      }
      await loadUnitEvents();
    } catch (err) {
      console.error("toggleUnitEventAttendance failed:", err);
      alert(err instanceof Error ? err.message : "Could not update RSVP.");
    }
  }

  useEffect(() => {
    if (activeTab === "members" && membership?.status === "approved" && members.length === 0) {
      loadMembers();
    }
  }, [activeTab, membership]);

  useEffect(() => {
    if (activeTab === "events" && membership?.status === "approved" && !unitEventsLoaded) {
      void loadUnitEvents();
    }
  }, [activeTab, membership?.status, unitEventsLoaded]);

  // Deep-link from notifications: ?unitPostId=…&commentId=… (unit_post_comments id)
  useEffect(() => {
    if (loading) return;
    if (membership?.status !== "approved") return;
    const params = new URLSearchParams(window.location.search);
    const unitPostId = params.get("unitPostId");
    const commentId = params.get("commentId");
    if (!unitPostId) return;
    if (!posts.some((p) => p.id === unitPostId)) return;

    setActiveTab("wall");
    setExpandedComments((prev) => new Set(prev).add(unitPostId));

    if (!comments[unitPostId]) {
      void (async () => {
        const token = await getToken();
        const res = await fetch(`/api/units/${slug}/posts/${unitPostId}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setComments((prev) => ({ ...prev, [unitPostId]: json.comments ?? [] }));
        }
      })();
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempt = 0;
    const maxAttempts = 32;

    const stripDeepLinkParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("unitPostId");
      url.searchParams.delete("commentId");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    };

    const tryScroll = () => {
      if (cancelled) return;
      const commentEl = commentId ? document.getElementById(`unit-comment-${commentId}`) : null;
      const postEl = document.getElementById(`unit-post-${unitPostId}`);
      const target = commentEl ?? postEl;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("feed-notification-highlight");
        window.setTimeout(() => target.classList.remove("feed-notification-highlight"), 4000);
        stripDeepLinkParams();
        return;
      }
      attempt += 1;
      if (attempt < maxAttempts) {
        timeoutId = window.setTimeout(tryScroll, 80);
      }
      // Don't strip URL params on exhaustion — if a commentId was requested and
      // comments haven't loaded yet, this effect will re-run when `comments` state
      // updates and will find the element on the next pass.
    };

    timeoutId = window.setTimeout(tryScroll, 120);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [loading, membership?.status, posts, slug, comments]);

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

  async function leaveGroup() {
    if (!currentUserId || !unit) return;
    if (!window.confirm(`Leave ${unit.name}?`)) return;
    setJoining(true);
    try {
      const { error } = await supabase
        .from("unit_members")
        .delete()
        .eq("unit_id", unit.id)
        .eq("user_id", currentUserId);
      if (error) {
        alert(error.message);
        return;
      }
      setMembership(null);
      window.location.href = "/units";
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
    if (!postInput.trim() && !postPhotoFile && !postPhotoUrl.trim() && !postGif) return;
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
        body: JSON.stringify({ content: postInput.trim() || null, photo_url: finalPhotoUrl, gif_url: postGif }),
      });
      if (res.ok) {
        setPostInput("");
        setPostPhotoFile(null);
        setPostPhotoPreview(null);
        if (postPhotoInputRef.current) postPhotoInputRef.current.value = "";
        setPostPhotoUrl("");
        setPostGif(null);
        await loadPosts();
      }
    } finally {
      setSubmittingPost(false);
    }
  }

  async function submitGroupPhoto() {
    if (!photoUploadFile || submittingPhoto) return;
    setSubmittingPhoto(true);
    setPhotoSubmitMsg(null);
    try {
      const finalPhotoUrl = await uploadUnitPhoto(photoUploadFile);
      const token = await getToken();
      const wallRes = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: photoCaption.trim() || null,
          photo_url: finalPhotoUrl,
          meta: { source: "photos_tab_wall" },
        }),
      });
      const wallJson = await wallRes.json().catch(() => ({})) as { error?: string };
      if (!wallRes.ok) {
        alert(wallJson.error ?? "Could not post photo to wall.");
        return;
      }

      const albumRes = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: photoCaption.trim() || null,
          photo_url: finalPhotoUrl,
          post_type: "photo_album",
          photo_submission_only: true,
          meta: { source: "photos_tab_album" },
        }),
      });
      const albumJson = await albumRes.json().catch(() => ({})) as { error?: string };
      if (!albumRes.ok) {
        alert(albumJson.error ?? "Photo posted to wall, but album submission failed.");
        return;
      }

      setPhotoCaption("");
      setPhotoUploadFile(null);
      if (photoUploadPreview) URL.revokeObjectURL(photoUploadPreview);
      setPhotoUploadPreview(null);
      if (photoUploadInputRef.current) photoUploadInputRef.current.value = "";
      setPhotoSubmitMsg(isGod ? "Photo posted and added to group album." : "Photo posted to wall and submitted to album for admin approval.");
      await loadPosts();
    } finally {
      setSubmittingPhoto(false);
    }
  }

  function startEditPost(postId: string, currentContent: string | null) {
    setEditingPostId(postId);
    setEditingPostContent(currentContent ?? "");
  }

  function cancelEditPost() {
    setEditingPostId(null);
    setEditingPostContent("");
  }

  async function savePostEdit(postId: string) {
    if (!currentUserId || !editingPostContent.trim()) return;
    setSavingPostId(postId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editingPostContent.trim() }),
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Could not update post.");
        return;
      }
      setEditingPostId(null);
      setEditingPostContent("");
      await loadPosts();
    } finally {
      setSavingPostId(null);
    }
  }

  async function deletePost(postId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Delete this group post?")) return;
    setDeletingPostId(postId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Could not delete post.");
        return;
      }
      await loadPosts();
    } finally {
      setDeletingPostId(null);
    }
  }

  function openFlagModal(contentId: string) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    setFlagCategoryChoice("general");
    setFlagModal({ contentType: "unit_post", contentId });
  }

  async function submitFlagFromModal() {
    if (!flagModal || !currentUserId) return;
    setFlaggingId(flagModal.contentId);
    try {
      const token = await getToken();
      const res = await fetch("/api/flag-content", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          contentType: flagModal.contentType,
          contentId: flagModal.contentId,
          category: flagCategoryChoice,
        }),
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Could not submit flag.");
        return;
      }
      alert("Flagged for review. Thank you.");
      setFlagModal(null);
      await loadPosts();
    } finally {
      setFlaggingId(null);
    }
  }

  async function toggleLike(postId: string) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    cancelDelayedLikeNotify(`unit:post:${postId}:${currentUserId}`);
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json() as {
        liked: boolean;
        like_count: number;
        pending_like_notify: Record<string, unknown> | null;
      };
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, user_liked: json.liked, like_count: json.like_count } : p
        )
      );
      if (json.liked && json.pending_like_notify) {
        const payload = json.pending_like_notify as Record<string, unknown>;
        scheduleDelayedLikeNotify(`unit:post:${postId}:${currentUserId}`, async () => {
          const p = postsRef.current.find((x) => x.id === postId);
          if (!p?.user_liked) return;
          await postNotifyJson(supabase, payload);
        });
      }
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

  async function submitComment(postId: string, imageFile?: File | null, gifUrl?: string | null) {
    const content = commentInputs[postId]?.trim() ?? "";
    if (!content && !imageFile && !gifUrl) return;

    let uploadedImageUrl: string | null = null;
    if (imageFile && currentUserId) {
      const path = `unit-comments/${currentUserId}/${postId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const { error: upErr } = await supabase.storage.from("feed-images").upload(path, imageFile, { upsert: false });
      if (!upErr) {
        const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
        uploadedImageUrl = data.publicUrl;
      }
    }

    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, image_url: uploadedImageUrl, gif_url: gifUrl ?? null }),
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
    if (isHiddenInviteAccount(u)) return false;
    const name = displayName(u).toLowerCase();
    const matchesQuery = !inviteQuery.trim() || name.includes(inviteQuery.toLowerCase());
    const matchesBranch = inviteBranches.size === 0 || (u.service && inviteBranches.has(u.service));
    return matchesQuery && matchesBranch;
  });

  // ── Styles ───────────────────────────────────────────────────────────────

  const isGod = membership?.status === "approved" && (membership.role === "owner" || membership.role === "admin");
  const wallPosts = posts.filter((p) => p.post_type !== "photo_album");
  const photos = posts.filter((p) => p.photo_url && p.post_type === "photo_album");
  const activeGalleryPhoto = galleryPhotoIndex !== null ? photos[galleryPhotoIndex] : null;

  async function openPhotoGallery(index: number) {
    setGalleryPhotoIndex(index);
    const postId = photos[index]?.id;
    if (!postId || comments[postId]) return;
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setComments((prev) => ({ ...prev, [postId]: json.comments ?? [] }));
    }
  }

  function shiftGallery(delta: number) {
    if (galleryPhotoIndex === null || photos.length === 0) return;
    setGalleryPhotoIndex((galleryPhotoIndex + delta + photos.length) % photos.length);
  }

  useEffect(() => {
    if (galleryPhotoIndex === null) return;
    function handleGalleryKeys(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        shiftGallery(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        shiftGallery(1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setGalleryPhotoIndex(null);
      }
    }
    window.addEventListener("keydown", handleGalleryKeys);
    return () => window.removeEventListener("keydown", handleGalleryKeys);
  }, [galleryPhotoIndex, photos.length]);

  const inputStyle: CSSProperties = {
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

  const padX = { paddingLeft: "max(20px, env(safe-area-inset-left))", paddingRight: "max(20px, env(safe-area-inset-right))" } as const;
  const bodyShell: CSSProperties = {
    maxWidth: 860,
    margin: "0 auto",
    boxSizing: "border-box",
    paddingTop: isDesktopShell ? 0 : 16,
    paddingBottom: 48,
    ...padX,
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={bodyShell}>
          <div style={{ color: t.textMuted, textAlign: "center", padding: 60 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (notFound || !unit) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={bodyShell}>
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Unit not found</div>
            <Link href="/units" style={{ color: "#3b82f6", fontWeight: 700, fontSize: 14 }}>← Back to Groups</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <div style={bodyShell}>
        {/* Back */}
        <Link href="/units" style={{ color: t.textMuted, fontSize: 13, fontWeight: 700, textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
          ← Groups
        </Link>

        {/* Cover + Header — vertical split: portrait cover | details */}
        <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${t.border}`, background: t.surface, marginBottom: 20 }}>
          <div className="unit-header-split">
            <div
              className="unit-header-cover-col"
              style={{ background: unit.cover_photo_url ? undefined : (isDark ? "#1a1a2e" : "#1e3a5f") }}
            >
              {unit.cover_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote unit cover URL
                <img src={unit.cover_photo_url} alt="" />
              ) : null}
            </div>
            <div className="unit-header-body" style={{ padding: "16px 20px 20px" }}>
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
                {currentUserId && !membership && (
                  <button onClick={requestJoin} disabled={joining} style={{ background: joining ? t.badgeBg : "#111", color: joining ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {joining && <span className="btn-spinner btn-spinner-dark" />}
                    Request to Join
                  </button>
                )}
                {membership?.status === "pending" && (
                  <div style={{ background: isDark ? "#2a2a00" : "#fef9c3", color: "#854d0e", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700 }}>
                    Request pending
                  </div>
                )}
                {membership?.status === "approved" && isGod && (
                  <>
                    <Link
                      href={`/units/${slug}/admin`}
                      style={{ background: "transparent", color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                    >
                      ⚙ Admin
                    </Link>
                    <button onClick={openInviteModal} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                      Invite Members
                    </button>
                    <button
                      onClick={leaveGroup}
                      disabled={joining}
                      style={{ background: "transparent", color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", opacity: joining ? 0.7 : 1 }}
                    >
                      {joining ? "Leaving..." : "Leave Group"}
                    </button>
                  </>
                )}
                {membership?.status === "approved" && !isGod && (
                  <>
                    <button onClick={openInviteModal} style={{ background: t.badgeBg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      Invite
                    </button>
                    <button
                      onClick={leaveGroup}
                      disabled={joining}
                      style={{ background: "transparent", color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", opacity: joining ? 0.7 : 1 }}
                    >
                      {joining ? "Leaving..." : "Leave Group"}
                    </button>
                  </>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Non-member gate */}
        {(!membership || membership.status === "pending") && (
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
        {membership?.status === "approved" && (
          <>
            {/* Tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${t.border}`, paddingBottom: 0 }}>
              {(["wall", "events", "members", "photos"] as const).map((tab) => (
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
                    style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 15, boxSizing: "border-box", background: t.surface, color: t.text, fontFamily: "inherit" }}
                  />

                  {postGif && (
                    <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                      <img src={postGif} alt="GIF" style={{ maxWidth: 200, borderRadius: 10, display: "block" }} />
                      <button type="button" onClick={() => setPostGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  )}

                  {postPhotoPreview && (
                    <div style={{ marginTop: 8, position: "relative", display: "inline-block", width: 200, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}` }}>
                      <img src={postPhotoPreview} alt="preview" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={() => { setPostPhotoPreview(null); setPostPhotoFile(null); if (postPhotoInputRef.current) postPhotoInputRef.current.value = ""; }}
                        style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.75)", color: "#fff", border: "none", borderRadius: "50%", width: 26, height: 26, fontWeight: 800, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >×</button>
                    </div>
                  )}

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
                      setPostGif(null);
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => postPhotoInputRef.current?.click()}
                      style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      {postPhotoFile ? "Change Photo" : "Add Photo"}
                    </button>

                    <EmojiPickerButton
                      value={postInput}
                      onChange={setPostInput}
                      inputRef={{ current: null }}
                      theme={isDark ? "dark" : "light"}
                    />

                    <GifPickerButton
                      onSelect={(url) => { setPostGif(url); setPostPhotoFile(null); setPostPhotoPreview(null); }}
                      theme={isDark ? "dark" : "light"}
                    />

                    <button
                      onClick={submitPost}
                      disabled={submittingPost || (!postInput.trim() && !postPhotoFile && !postGif)}
                      style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: submittingPost || (!postInput.trim() && !postPhotoFile && !postGif) ? "not-allowed" : "pointer", opacity: submittingPost || (!postInput.trim() && !postPhotoFile && !postGif) ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}
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

                {wallPosts.map((post) => {
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
                  const canManagePost = currentUserId === post.user_id;
                  const isEditingPost = editingPostId === post.id;
                  return (
                    <PostCard
                      key={post.id}
                      post={post}
                      t={t}
                      isDark={isDark}
                      comments={comments[post.id]}
                      commentInput={commentInputs[post.id] ?? ""}
                      onCommentInputChange={(v) => setCommentInputs((prev) => ({ ...prev, [post.id]: v }))}
                      expanded={expandedComments.has(post.id)}
                      onToggleLike={() => toggleLike(post.id)}
                      onToggleComments={() => toggleComments(post.id)}
                      onSubmitComment={(imageFile, gifUrl) => submitComment(post.id, imageFile, gifUrl)}
                      canManagePost={canManagePost}
                      isEditingPost={isEditingPost}
                      editingPostContent={editingPostContent}
                      savingPost={savingPostId === post.id}
                      deletingPost={deletingPostId === post.id}
                      flaggingPost={flaggingId === post.id}
                      isMobile={isMobile}
                      onEdit={() => startEditPost(post.id, post.content)}
                      onCancelEdit={cancelEditPost}
                      onEditContentChange={setEditingPostContent}
                      onSaveEdit={() => savePostEdit(post.id)}
                      onDelete={() => deletePost(post.id)}
                      onFlag={() => openFlagModal(post.id)}
                      onAddToRabbithole={
                        currentUserId &&
                        (RABBITHOLE_THRESHOLD_BYPASS || post.like_count >= 3 || post.comment_count >= 2) &&
                        !post.rabbithole_thread_id
                          ? () => setRabbitholeModalPost({ id: post.id, content: post.content ?? "" })
                          : undefined
                      }
                      rabbitholeThreadId={post.rabbithole_thread_id ?? null}
                    />
                  );
                })}
              </div>
            )}

            {/* EVENTS TAB */}
            {activeTab === "events" && (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Group Events</div>
                      <div style={{ marginTop: 3, fontSize: 13, color: t.textMuted }}>Private calendar for {unit.name} members.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnitEventFormOpen((prev) => !prev)}
                      style={{ border: "none", borderRadius: 10, background: "#111", color: "#fff", padding: "9px 16px", fontWeight: 800, cursor: "pointer" }}
                    >
                      {unitEventFormOpen ? "Close" : "Create Event"}
                    </button>
                  </div>

                  {unitEventFormOpen && (
                    <div style={{ marginTop: 16, border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, padding: 16, display: "grid", gap: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Add Event</div>
                        <button
                          type="button"
                          onClick={() => setUnitEventFormOpen(false)}
                          style={{ border: "none", background: "transparent", color: t.textMuted, fontWeight: 800, fontSize: 18, cursor: "pointer", lineHeight: 1 }}
                          aria-label="Close add event form"
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Title *</label>
                        <input
                          value={unitEventForm.title}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, title: e.target.value }))}
                          placeholder="Event title"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Date *</label>
                        <input
                          type="date"
                          value={unitEventForm.date}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, date: e.target.value }))}
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Time</label>
                        <input
                          value={unitEventForm.event_time}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, event_time: e.target.value }))}
                          placeholder="e.g. '6:00 PM EST' or '0900 - 1100'"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Location / Address</label>
                        <input
                          value={unitEventForm.location}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, location: e.target.value }))}
                          placeholder="Venue or street address (or 'Online — Zoom')"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Organization</label>
                        <input
                          value={unitEventForm.organization}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, organization: e.target.value }))}
                          placeholder="Hosting organization"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Description</label>
                        <textarea
                          value={unitEventForm.description}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder="Event details..."
                          rows={4}
                          style={{ ...inputStyle, minHeight: 92, resize: "vertical", marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Point of Contact (POC) name</label>
                        <input
                          value={unitEventForm.poc_name}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, poc_name: e.target.value }))}
                          placeholder="Name of organizer / point of contact"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>POC phone number</label>
                        <input
                          value={unitEventForm.poc_phone}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, poc_phone: e.target.value }))}
                          placeholder="(555) 555-1234"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Sign-up / External URL</label>
                        <input
                          value={unitEventForm.signup_url}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, signup_url: e.target.value }))}
                          placeholder="https://..."
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setUnitEventFormOpen(false)}
                          style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: "10px 18px", fontWeight: 800, background: t.surface, color: t.text, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={createUnitEvent}
                          disabled={unitEventSubmitting || !unitEventForm.title.trim() || !unitEventForm.date}
                          style={{ border: "none", borderRadius: 12, padding: "10px 20px", fontWeight: 900, background: "#111", color: "#fff", cursor: unitEventSubmitting || !unitEventForm.title.trim() || !unitEventForm.date ? "not-allowed" : "pointer", opacity: unitEventSubmitting || !unitEventForm.title.trim() || !unitEventForm.date ? 0.65 : 1 }}
                        >
                          {unitEventSubmitting ? "Publishing..." : "Publish Event"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, overflow: "hidden" }}>
                  <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 900, color: t.text }}>Upcoming Group Events</div>
                    <div style={{ color: t.textMuted, fontSize: 12, fontWeight: 700 }}>{unitEvents.length} event{unitEvents.length === 1 ? "" : "s"}</div>
                  </div>
                  {unitEventsLoading ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted }}>Loading events...</div>
                  ) : unitEvents.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted }}>No group events yet.</div>
                  ) : (
                    <div style={{ display: "grid" }}>
                      {unitEvents.map((event, idx) => {
                        const counts = unitEventAttendance[event.id] ?? { interested: 0, going: 0 };
                        const myStatus = unitEventMyAttendance[event.id] ?? null;
                        return (
                          <div key={event.id} style={{ display: "flex", gap: 14, padding: 16, borderBottom: idx < unitEvents.length - 1 ? `1px solid ${t.borderLight}` : "none" }}>
                            <div style={{ width: 54, flexShrink: 0, borderRadius: 10, background: "#111", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px" }}>
                              <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", opacity: 0.8 }}>{new Date(`${event.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</div>
                              <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{new Date(`${event.date}T12:00:00`).getDate()}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button type="button" onClick={() => setSelectedUnitEvent(event)} style={{ border: "none", background: "transparent", padding: 0, margin: 0, color: t.text, fontWeight: 900, fontSize: 16, cursor: "pointer", textAlign: "left" }}>
                                {event.title}
                              </button>
                              <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>{formatEventDate(event.date)}</div>
                              <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>Group Event</span>
                                <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>Private</span>
                                {event.location ? <span style={{ color: t.textMuted, fontSize: 12 }}>{event.location}</span> : null}
                              </div>
                              {event.description ? (
                                <div style={{ marginTop: 8, color: t.textMuted, fontSize: 13, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{event.description}</div>
                              ) : null}
                              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                                <button type="button" onClick={() => toggleUnitEventAttendance(event.id, "interested")} style={{ background: myStatus === "interested" ? t.text : t.surface, color: myStatus === "interested" ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                                  Interested{counts.interested > 0 ? ` · ${counts.interested}` : ""}
                                </button>
                                <button type="button" onClick={() => toggleUnitEventAttendance(event.id, "going")} style={{ background: myStatus === "going" ? t.text : t.surface, color: myStatus === "going" ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                                  Going{counts.going > 0 ? ` · ${counts.going}` : ""}
                                </button>
                                {unitSavedEventIds.has(event.id) ? <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>Saved</span> : null}
                                {event.signup_url ? <a href={event.signup_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb", fontWeight: 800, textDecoration: "none" }}>Website →</a> : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: t.text }}>Add a group photo</div>
                      <div style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                        {isGod
                          ? "Posts to the wall immediately and adds to the album immediately."
                          : "Posts to the wall immediately; album entry is submitted for admin approval."}
                      </div>
                    </div>
                    {photoSubmitMsg ? <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 800 }}>{photoSubmitMsg}</div> : null}
                  </div>

                  {photoUploadPreview ? (
                    <div style={{ width: 220, maxWidth: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, marginBottom: 12, position: "relative" }}>
                      <img src={photoUploadPreview} alt="Selected group photo" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={() => {
                          if (photoUploadPreview) URL.revokeObjectURL(photoUploadPreview);
                          setPhotoUploadPreview(null);
                          setPhotoUploadFile(null);
                          if (photoUploadInputRef.current) photoUploadInputRef.current.value = "";
                        }}
                        style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}

                  <input
                    ref={photoUploadInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) return;
                      if (photoUploadPreview) URL.revokeObjectURL(photoUploadPreview);
                      setPhotoUploadFile(file);
                      setPhotoUploadPreview(URL.createObjectURL(file));
                      setPhotoSubmitMsg(null);
                    }}
                  />
                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="Optional caption"
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => photoUploadInputRef.current?.click()}
                        style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 800, cursor: "pointer" }}
                      >
                        {photoUploadFile ? "Change Photo" : "Choose Photo"}
                      </button>
                      <button
                        type="button"
                        onClick={submitGroupPhoto}
                        disabled={!photoUploadFile || submittingPhoto}
                        style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 900, cursor: !photoUploadFile || submittingPhoto ? "not-allowed" : "pointer", opacity: !photoUploadFile || submittingPhoto ? 0.65 : 1 }}
                      >
                        {submittingPhoto ? "Submitting..." : isGod ? "Add Photo" : "Submit for Approval"}
                      </button>
                    </div>
                  </div>
                </div>

                {photos.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40 }}>No photos shared yet.</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                  {photos.map((p, index) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { void openPhotoGallery(index); }}
                      style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: "transparent" }}
                    >
                      <img src={p.photo_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Group photo gallery modal */}
      {activeGalleryPhoto && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setGalleryPhotoIndex(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 550, padding: isMobile ? 10 : 20 }}
        >
          <div style={{ width: "100%", maxWidth: 860, maxHeight: "92vh", borderRadius: 16, overflow: "hidden", border: `1px solid ${isDark ? "#222" : "#d1d5db"}`, background: isDark ? "#141414" : "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", background: "#000", minHeight: isMobile ? 260 : 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={activeGalleryPhoto.photo_url!} alt="" style={{ width: "100%", maxHeight: isMobile ? 360 : 520, objectFit: "contain", display: "block" }} />
              <button onClick={() => setGalleryPhotoIndex(null)} style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
              {photos.length > 1 && (
                <>
                  <button onClick={() => shiftGallery(-1)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 20, cursor: "pointer" }}>‹</button>
                  <button onClick={() => shiftGallery(1)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 20, cursor: "pointer" }}>›</button>
                </>
              )}
            </div>

            <div style={{ padding: 14, overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => toggleLike(activeGalleryPhoto.id)}
                  style={{ border: "none", background: "transparent", color: activeGalleryPhoto.user_liked ? "#ef4444" : t.textMuted, fontWeight: 800, fontSize: 14, lineHeight: 1, cursor: "pointer" }}
                >
                  {activeGalleryPhoto.user_liked ? "Unlike" : "Like"}
                </button>
                <div style={{ fontSize: 14, color: t.textMuted }}>{activeGalleryPhoto.like_count} likes</div>
                <div style={{ marginLeft: "auto", fontSize: 12, color: t.textFaint }}>{new Date(activeGalleryPhoto.created_at).toLocaleDateString()}</div>
              </div>
              {activeGalleryPhoto.content ? (
                <div style={{ fontSize: 14, color: t.text, marginTop: 8, lineHeight: 1.5 }}>{activeGalleryPhoto.content}</div>
              ) : null}

              <div style={{ marginTop: 14, borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Comments</div>
                {(comments[activeGalleryPhoto.id] ?? []).length === 0 ? (
                  <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 10 }}>No comments yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                    {(comments[activeGalleryPhoto.id] ?? []).map((c) => (
                      <div key={c.id} style={{ display: "flex", gap: 8 }}>
                        <Avatar photo={c.author_photo} name={c.author_name} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: t.text }}><strong>{c.author_name}</strong> {c.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={commentInputs[activeGalleryPhoto.id] ?? ""}
                    onChange={(e) => setCommentInputs((prev) => ({ ...prev, [activeGalleryPhoto.id]: e.target.value }))}
                    placeholder="Write a comment..."
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => submitComment(activeGalleryPhoto.id)}
                    style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                        if (active) s.delete(branch);
                        else s.add(branch);
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
                      if (checked) s.delete(u.user_id);
                      else s.add(u.user_id);
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

      {flagModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unit-flag-modal-title"
          onClick={() => !flaggingId && setFlagModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, padding: "20px 22px", boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.12)" }}
          >
            <h2 id="unit-flag-modal-title" style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800, color: t.text }}>
              Flag this group post
            </h2>
            <label htmlFor="unit-flag-reason" style={{ display: "block", fontSize: 13, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
              Reason
            </label>
            <select
              id="unit-flag-reason"
              value={flagCategoryChoice}
              onChange={(e) => setFlagCategoryChoice(e.target.value as FlagCategory)}
              disabled={!!flaggingId}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, marginBottom: 18, boxSizing: "border-box" }}
            >
              {FLAG_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {FLAG_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => !flaggingId && setFlagModal(null)}
                disabled={!!flaggingId}
                style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.surfaceHover, color: t.text, fontWeight: 700, fontSize: 14, cursor: flaggingId ? "default" : "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitFlagFromModal()}
                disabled={!!flaggingId}
                style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#b91c1c", color: "white", fontWeight: 700, fontSize: 14, cursor: flaggingId ? "default" : "pointer" }}
              >
                {flaggingId ? "Submitting..." : "Submit Flag"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUnitEvent && (
        <div
          onClick={() => setSelectedUnitEvent(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 650, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", background: t.surface, color: t.text, borderRadius: 18, border: `1px solid ${t.border}`, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 9px", fontSize: 11, fontWeight: 900 }}>Group Event</span>
                  <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 9px", fontSize: 11, fontWeight: 900 }}>{unit?.name}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{selectedUnitEvent.title}</div>
                <div style={{ marginTop: 8, color: t.textMuted, fontSize: 14 }}>{formatEventDate(selectedUnitEvent.date)}</div>
              </div>
              <button type="button" onClick={() => setSelectedUnitEvent(null)} style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 800 }}>
                X
              </button>
            </div>

            {selectedUnitEvent.description ? (
              <div style={{ marginTop: 18, color: t.textMuted, lineHeight: 1.6, fontSize: 14, whiteSpace: "pre-wrap" }}>{selectedUnitEvent.description}</div>
            ) : null}

            <div style={{ marginTop: 20, borderTop: `1px solid ${t.border}`, paddingTop: 16, display: "grid", gap: 8 }}>
              {selectedUnitEvent.event_time ? <div style={{ color: t.textMuted, fontSize: 14 }}><strong>Time:</strong> {selectedUnitEvent.event_time}</div> : null}
              {selectedUnitEvent.location ? <div style={{ color: t.textMuted, fontSize: 14 }}><strong>Location:</strong> {selectedUnitEvent.location}</div> : null}
              {(selectedUnitEvent.poc_name || selectedUnitEvent.poc_phone) ? (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Point of Contact:</strong> {selectedUnitEvent.poc_name ?? ""}
                  {selectedUnitEvent.poc_name && selectedUnitEvent.poc_phone ? " — " : ""}
                  {selectedUnitEvent.poc_phone ? <a href={`tel:${selectedUnitEvent.poc_phone.replace(/\s+/g, "")}`} style={{ fontWeight: 800 }}>{selectedUnitEvent.poc_phone}</a> : null}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" onClick={() => toggleUnitEventAttendance(selectedUnitEvent.id, "interested")} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: unitEventMyAttendance[selectedUnitEvent.id] === "interested" ? t.text : t.surface, color: unitEventMyAttendance[selectedUnitEvent.id] === "interested" ? t.surface : t.text }}>
                Interested{(unitEventAttendance[selectedUnitEvent.id]?.interested ?? 0) > 0 ? ` · ${unitEventAttendance[selectedUnitEvent.id].interested}` : ""}
              </button>
              <button type="button" onClick={() => toggleUnitEventAttendance(selectedUnitEvent.id, "going")} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: unitEventMyAttendance[selectedUnitEvent.id] === "going" ? t.text : t.surface, color: unitEventMyAttendance[selectedUnitEvent.id] === "going" ? t.surface : t.text }}>
                Going{(unitEventAttendance[selectedUnitEvent.id]?.going ?? 0) > 0 ? ` · ${unitEventAttendance[selectedUnitEvent.id].going}` : ""}
              </button>
              {selectedUnitEvent.signup_url ? <a href={selectedUnitEvent.signup_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", textDecoration: "none", background: "#111", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 800, marginLeft: "auto" }}>Open Event Link</a> : null}
            </div>
          </div>
        </div>
      )}

      {/* Add to Rabbithole modal — unit post source */}
      {rabbitholeModalPost && (
        <AddToRabbitholeModal
          open={true}
          post={rabbitholeModalPost}
          sourceType="unit"
          onClose={() => setRabbitholeModalPost(null)}
          onSuccess={(threadId) => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === rabbitholeModalPost.id ? { ...p, rabbithole_thread_id: threadId } : p
              )
            );
            setRabbitholeModalPost(null);
          }}
        />
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

function PostCard({
  post,
  t,
  isDark,
  comments,
  commentInput,
  onCommentInputChange,
  expanded,
  onToggleLike,
  onToggleComments,
  onSubmitComment,
  canManagePost,
  isEditingPost,
  editingPostContent,
  savingPost,
  deletingPost,
  flaggingPost,
  isMobile,
  onEdit,
  onCancelEdit,
  onEditContentChange,
  onSaveEdit,
  onDelete,
  onFlag,
  onAddToRabbithole,
  rabbitholeThreadId,
}: {
  post: UnitPost; t: ThemeTokens; isDark: boolean;
  comments: Comment[] | undefined;
  commentInput: string;
  onCommentInputChange: (v: string) => void;
  expanded: boolean;
  onToggleLike: () => void;
  onToggleComments: () => void;
  onSubmitComment: (imageFile?: File | null, gifUrl?: string | null) => Promise<void>;
  canManagePost: boolean;
  isEditingPost: boolean;
  editingPostContent: string;
  savingPost: boolean;
  deletingPost: boolean;
  flaggingPost: boolean;
  isMobile: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onEditContentChange: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onFlag: () => void;
  onAddToRabbithole?: (() => void) | undefined;
  rabbitholeThreadId?: string | null;
}) {
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentGif, setCommentGif] = useState<string | null>(null);
  const [commentImage, setCommentImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const commentImageInputRef = useRef<HTMLInputElement | null>(null);

  function clearCommentMedia() {
    setCommentGif(null);
    if (commentImage) URL.revokeObjectURL(commentImage.previewUrl);
    setCommentImage(null);
    if (commentImageInputRef.current) commentImageInputRef.current.value = "";
  }

  async function handleSend() {
    if (submittingComment) return;
    setSubmittingComment(true);
    try {
      await onSubmitComment(commentImage?.file ?? null, commentGif);
      clearCommentMedia();
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <div id={`unit-post-${post.id}`} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
      {/* Author row */}
      <FeedPostHeader
        profileHref={`/profile/${post.user_id}`}
        avatar={<Avatar photo={post.author_photo} name={post.author_name} size={38} />}
        authorName={post.author_name}
        createdAtLabel={timeAgo(post.created_at)}
        t={t}
        isOwnPost={canManagePost}
        canEdit={canManagePost}
        canDelete={canManagePost}
        isEditingPost={isEditingPost}
        isMobile={isMobile}
        isDeleting={deletingPost}
        isFlagging={flaggingPost}
        onEdit={onEdit}
        onDelete={onDelete}
        onFlag={onFlag}
      />

      {isEditingPost ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={editingPostContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            style={{
              width: "100%",
              minHeight: 90,
              border: `1px solid ${t.inputBorder}`,
              borderRadius: 10,
              padding: 10,
              resize: "vertical",
              fontSize: 15,
              boxSizing: "border-box",
              background: t.input,
              color: t.text,
              fontFamily: "inherit",
            }}
          />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onCancelEdit}
              style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", color: t.text }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={savingPost}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: savingPost ? "not-allowed" : "pointer", opacity: savingPost ? 0.7 : 1 }}
            >
              {savingPost ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* Content */}
      {post.rabbithole_contribution_id && (
        <div style={{ marginBottom: 6, fontSize: 11, color: t.textFaint }}>
          Shared from{" "}
          <Link
            href={`/rabbithole/contribution/${encodeURIComponent(post.rabbithole_contribution_id)}`}
            style={{ color: t.textMuted, textDecoration: "underline" }}
          >
            RabbitHole
          </Link>
        </div>
      )}
      {post.content && (
        <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: post.photo_url ? 12 : 0, color: t.text }}>{post.content}</div>
      )}

      {post.rabbithole_contribution_id && post.meta?.og?.url && (() => {
        const og = post.meta?.og;
        if (!og?.url) return null;
        const ytId = getYouTubeId(og.url);
        if (ytId) {
          return (
            <div style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", maxWidth: 520 }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }
        return (
          <a
            href={og.url}
            target="_blank"
            rel="noreferrer"
            style={{
              marginTop: 10,
              display: "block",
              textDecoration: "none",
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 10,
              background: t.badgeBg,
              color: t.text,
            }}
          >
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2 }}>
              {og.site_name || "External source"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
              {og.title || "Open shared RabbitHole source"}
            </div>
            {og.description && <div style={{ fontSize: 13, color: t.textMuted }}>{og.description}</div>}
          </a>
        );
      })()}

      {/* Photo — square aspect ratio matching feed */}
      {post.photo_url && (
        <div style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, aspectRatio: "1 / 1", maxWidth: 420 }}>
          <img src={post.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}

      {/* GIF */}
      {post.gif_url && (
        <div style={{ marginTop: 10 }}>
          <img src={post.gif_url} alt="GIF" style={{ maxWidth: 320, borderRadius: 12, display: "block" }} />
        </div>
      )}

      {/* Like / Comment / Rabbithole toolbar */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onToggleLike}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: post.user_liked ? t.text : t.textMuted, fontSize: 14 }}
        >
          {post.user_liked ? "Unlike" : "Like"}
        </button>
        <button
          type="button"
          onClick={onToggleComments}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: t.textMuted, fontSize: 14 }}
        >
          {expanded ? "Hide Comments" : "Comment"}
        </button>
        <div style={{ fontSize: 14, color: t.textMuted }}>{post.like_count} {post.like_count === 1 ? "like" : "likes"}</div>
        <div style={{ fontSize: 14, color: t.textMuted }}>{post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}</div>

        {/* Rabbithole button — grouped at right edge */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          {rabbitholeThreadId ? (
            <div
              title="Filed to Rabbithole — locked"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                overflow: "hidden",
                border: "2px solid #7c3aed",
                opacity: 0.45,
                filter: "grayscale(50%)",
                boxSizing: "border-box",
                cursor: "not-allowed",
                flexShrink: 0,
              }}
            >
              <img
                src="/rabbithole-btn.png"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ) : onAddToRabbithole ? (
            <button
              type="button"
              title="Add to Rabbithole"
              onClick={onAddToRabbithole}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "block", flexShrink: 0 }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `2px solid ${t.border}`,
                  opacity: 0.88,
                  boxSizing: "border-box",
                }}
              >
                <img
                  src="/rabbithole-btn.png"
                  alt="Add to Rabbithole"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            </button>
          ) : null}
        </div>
      </div>

      {/* Murphy banner — shown when post has been filed to Rabbithole */}
      {rabbitholeThreadId && <MurphyRabbitholeBanner />}
        </>
      )}

      {/* Comments section */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.borderLight}` }}>
          {(comments ?? []).length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 10 }}>No comments yet.</div>
          )}
          {(comments ?? []).map((c) => (
            <div key={c.id} id={`unit-comment-${c.id}`} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <Avatar photo={c.author_photo} name={c.author_name} size={28} />
              <div style={{ background: t.badgeBg, borderRadius: 10, padding: "7px 12px", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>{c.author_name}</div>
                {c.content && <div style={{ fontSize: 13, color: t.text, lineHeight: 1.45 }}>{c.content}</div>}
                {c.image_url && (
                  <div style={{ marginTop: 8, maxWidth: 180, borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}` }}>
                    <img src={c.image_url} alt="Comment image" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                  </div>
                )}
                {c.gif_url && (
                  <div style={{ marginTop: 8 }}>
                    <img src={c.gif_url} alt="GIF" style={{ maxWidth: 180, borderRadius: 10, display: "block" }} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Comment input */}
          <div style={{ marginTop: 8 }}>
            <textarea
              value={commentInput}
              onChange={(e) => onCommentInputChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder="Write a comment..."
              rows={2}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />

            <input
              ref={commentImageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (commentImage) URL.revokeObjectURL(commentImage.previewUrl);
                setCommentImage({ file, previewUrl: URL.createObjectURL(file) });
                setCommentGif(null);
              }}
            />

            {/* GIF preview */}
            {commentGif && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                <img src={commentGif} alt="GIF" style={{ maxWidth: 180, borderRadius: 10, display: "block" }} />
                <button type="button" onClick={() => setCommentGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            )}

            {/* Image preview */}
            {commentImage && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block", width: 120, borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}` }}>
                <img src={commentImage.previewUrl} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                <button type="button" onClick={() => { if (commentImage) URL.revokeObjectURL(commentImage.previewUrl); setCommentImage(null); if (commentImageInputRef.current) commentImageInputRef.current.value = ""; }} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.75)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            )}

            {/* Action row: Photo / Emoji / GIF / Send */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => commentImageInputRef.current?.click()}
                style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "7px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {commentImage ? "Change Photo" : "Add Photo"}
              </button>

              <EmojiPickerButton
                value={commentInput}
                onChange={onCommentInputChange}
                inputRef={{ current: null }}
                theme={isDark ? "dark" : "light"}
              />

              <GifPickerButton
                onSelect={(url) => { setCommentGif(url); setCommentImage(null); }}
                theme={isDark ? "dark" : "light"}
              />

              <button
                type="button"
                disabled={submittingComment}
                onClick={() => void handleSend()}
                style={{ marginLeft: "auto", background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: submittingComment ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: submittingComment ? 0.7 : 1 }}
              >
                {submittingComment && <span className="btn-spinner" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
