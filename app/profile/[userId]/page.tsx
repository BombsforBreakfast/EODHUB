"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/lib/supabaseClient";
import NavBar from "../../components/NavBar";
import { useTheme } from "../../lib/ThemeContext";

type Profile = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  role: string | null;
  resume_text: string | null;
  tech_types: string[] | string | null;
  verification_status: string | null;
  service: string | null;
  status: string | null;
  years_experience: string | null;
  skill_badge: string | null;
};

type RawComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url: string | null;
};

type WallComment = RawComment & {
  authorName: string;
  authorPhotoUrl: string | null;
  authorService: string | null;
  likeCount: number;
  likedByCurrentUser: boolean;
};

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type Post = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url: string | null;
  image_urls: string[];
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
  comments: WallComment[];
  og_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

type ProfilePhoto = {
  id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  is_pinned: boolean;
  created_at: string;
};

type PhotoComment = {
  id: string;
  photo_id: string;
  user_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorPhotoUrl: string | null;
};

const SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force", "Civilian Bomb Tech"];
const STATUS_OPTIONS = ["Active", "Former", "Retired", "Civil Service"];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "Civil Service"];
const YEARS_OPTIONS = [...Array.from({ length: 39 }, (_, i) => String(i + 1)), "40+"];

type ConnectionType = "worked_with" | "know";

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url);
}

const BARE_DOMAIN_RE = /\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/;
const URL_PATTERN_SRC = /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/.source;

function extractFirstUrl(text: string): string | null {
  const explicit = text.match(/https?:\/\/[^\s]+/);
  if (explicit) return explicit[0].replace(/[.,)>]+$/, "");
  const bare = text.match(BARE_DOMAIN_RE);
  if (bare) return `https://${bare[0].replace(/[.,)>]+$/, "")}`;
  return null;
}

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(URL_PATTERN_SRC, "g");
  while ((match = re.exec(text)) !== null) {
    const raw = match[0].replace(/[.,)>]+$/, "");
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={match.index} href={href} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}>
        {raw}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function OgCard({ og }: { og: OgPreview }) {
  const { t: ogT } = useTheme();
  return (
    <a href={og.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, border: `1px solid ${ogT.border}`, borderRadius: 12, overflow: "hidden", background: ogT.bg, textDecoration: "none", color: "inherit" }}>
      {og.image && (
        <img src={og.image} alt={og.title || ""} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
      )}
      <div style={{ padding: "10px 14px" }}>
        {og.siteName && <div style={{ fontSize: 11, color: ogT.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{og.siteName}</div>}
        {og.title && <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{og.title}</div>}
        {og.description && <div style={{ fontSize: 13, color: ogT.textMuted, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{og.description}</div>}
        <div style={{ marginTop: 6, fontSize: 12, color: ogT.textFaint, wordBreak: "break-all" }}>{og.url}</div>
      </div>
    </a>
  );
}

function getServiceRingColor(service: string | null | undefined): string | null {
  switch (service) {
    case "Army": return "#556b2f";
    case "Navy": return "#003087";
    case "Air Force": return "#00b0f0";
    case "Marines": return "#bf0a30";
    case "Civilian Bomb Tech": return "#000000";
    default: return null;
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

export default function PublicProfilePage() {
  const params = useParams();

  const rawUserId = params?.userId;
  const userId =
    typeof rawUserId === "string"
      ? rawUserId
      : Array.isArray(rawUserId)
      ? rawUserId[0]
      : null;

  const { t } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [loading, setLoading] = useState(true);

  const [postContent, setPostContent] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const ogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPostImages, setSelectedPostImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const postImageInputRef = useRef<HTMLInputElement | null>(null);

  const [workedWithCount, setWorkedWithCount] = useState(0);
  const [knowCount, setKnowCount] = useState(0);

  const [currentUserWorkedWith, setCurrentUserWorkedWith] = useState(false);
  const [currentUserKnows, setCurrentUserKnows] = useState(false);
  const [togglingConnection, setTogglingConnection] = useState<ConnectionType | null>(null);

  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [togglingPinnedId, setTogglingPinnedId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editRole, setEditRole] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editService, setEditService] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editYearsExp, setEditYearsExp] = useState("");
  const [editSkillBadge, setEditSkillBadge] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<ProfilePhoto | null>(null);
  const [photoLikes, setPhotoLikes] = useState<Record<string, { count: number; likedByMe: boolean }>>({});
  const [photoComments, setPhotoComments] = useState<Record<string, PhotoComment[]>>({});
  const [photoCommentInput, setPhotoCommentInput] = useState("");
  const [togglingPhotoLikeFor, setTogglingPhotoLikeFor] = useState<string | null>(null);
  const [submittingPhotoComment, setSubmittingPhotoComment] = useState(false);

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [togglingLikeFor, setTogglingLikeFor] = useState<string | null>(null);
  const [submittingCommentFor, setSubmittingCommentFor] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [togglingCommentLikeFor, setTogglingCommentLikeFor] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  async function loadProfile(targetUserId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, first_name, last_name, bio, photo_url, role, resume_text, tech_types, verification_status, service, status, years_experience, skill_badge"
      )
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (error) {
      console.error("Profile load error:", error);
      return;
    }

    setProfile((data as Profile | null) ?? null);
  }

  async function loadPosts(targetUserId: string) {
    const { data: rawData, error } = await supabase
      .from("posts")
      .select("id, user_id, content, created_at, og_url, og_title, og_description, og_image, og_site_name")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Profile posts load error:", error);
      return;
    }

    const rawPosts = (rawData ?? []) as { id: string; user_id: string; content: string; created_at: string; og_url?: string | null; og_title?: string | null; og_description?: string | null; og_image?: string | null; og_site_name?: string | null }[];
    if (rawPosts.length === 0) { setPosts([]); return; }

    const postIds = rawPosts.map((p) => p.id);

    // Legacy single image_url
    const { data: legacyImgData } = await supabase
      .from("posts").select("id, image_url").in("id", postIds);
    const legacyImageMap = new Map<string, string | null>();
    ((legacyImgData ?? []) as { id: string; image_url: string | null }[]).forEach((r) =>
      legacyImageMap.set(r.id, r.image_url ?? null)
    );

    // Multi-image post_images table
    const { data: postImgData } = await supabase
      .from("post_images").select("id, post_id, image_url, sort_order")
      .in("post_id", postIds).order("sort_order", { ascending: true });
    const multiImageMap = new Map<string, string[]>();
    ((postImgData ?? []) as { id: string; post_id: string; image_url: string; sort_order: number | null }[]).forEach((r) => {
      const arr = multiImageMap.get(r.post_id) || [];
      arr.push(r.image_url);
      multiImageMap.set(r.post_id, arr);
    });

    // Likes
    const { data: likesData } = await supabase
      .from("post_likes").select("post_id, user_id").in("post_id", postIds);
    const likesByPost = new Map<string, string[]>();
    ((likesData ?? []) as { post_id: string; user_id: string }[]).forEach((r) => {
      const arr = likesByPost.get(r.post_id) || [];
      arr.push(r.user_id);
      likesByPost.set(r.post_id, arr);
    });

    // Comments
    const { data: commentsData } = await supabase
      .from("post_comments").select("id, post_id, user_id, content, created_at, image_url")
      .in("post_id", postIds).order("created_at", { ascending: true });
    const rawComments = (commentsData ?? []) as RawComment[];

    // Comment likes
    const commentIds = rawComments.map((c) => c.id);
    const { data: commentLikesData } = commentIds.length > 0
      ? await supabase.from("post_comment_likes").select("comment_id, user_id").in("comment_id", commentIds)
      : { data: [] };
    const likesByComment = new Map<string, string[]>();
    ((commentLikesData ?? []) as { comment_id: string; user_id: string }[]).forEach((r) => {
      const arr = likesByComment.get(r.comment_id) || [];
      arr.push(r.user_id);
      likesByComment.set(r.comment_id, arr);
    });

    // Comment author profiles
    const commentAuthorIds = [...new Set(rawComments.map((c) => c.user_id))];
    const { data: commentProfileData } = commentAuthorIds.length > 0
      ? await supabase.from("profiles").select("user_id, first_name, last_name, photo_url, service").in("user_id", commentAuthorIds)
      : { data: [] };
    const commentNameMap = new Map<string, string>();
    const commentPhotoMap = new Map<string, string | null>();
    const commentServiceMap = new Map<string, string | null>();
    ((commentProfileData ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; service: string | null }[]).forEach((p) => {
      commentNameMap.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "User");
      commentPhotoMap.set(p.user_id, p.photo_url ?? null);
      commentServiceMap.set(p.user_id, p.service ?? null);
    });

    // Build comment map
    const commentsByPost = new Map<string, WallComment[]>();
    rawComments.forEach((c) => {
      const arr = commentsByPost.get(c.post_id) || [];
      const cLikes = likesByComment.get(c.id) || [];
      arr.push({
        ...c,
        authorName: commentNameMap.get(c.user_id) || "User",
        authorPhotoUrl: commentPhotoMap.get(c.user_id) ?? null,
        authorService: commentServiceMap.get(c.user_id) ?? null,
        likeCount: cLikes.length,
        likedByCurrentUser: currentUserId ? cLikes.includes(currentUserId) : false,
      });
      commentsByPost.set(c.post_id, arr);
    });

    const merged: Post[] = rawPosts.map((p) => {
      const postLikes = likesByPost.get(p.id) || [];
      const multiImages = multiImageMap.get(p.id) || [];
      const legacyImage = legacyImageMap.get(p.id) ?? null;
      const postComments = commentsByPost.get(p.id) || [];
      return {
        ...p,
        image_url: legacyImage,
        image_urls: multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        likeCount: postLikes.length,
        commentCount: postComments.length,
        likedByCurrentUser: currentUserId ? postLikes.includes(currentUserId) : false,
        comments: postComments,
        og_url: p.og_url ?? null,
        og_title: p.og_title ?? null,
        og_description: p.og_description ?? null,
        og_image: p.og_image ?? null,
        og_site_name: p.og_site_name ?? null,
      };
    });

    setPosts(merged);
  }

  function notify(recipientId: string, message: string, postOwnerId: string) {
    if (!currentUserId || recipientId === currentUserId || !currentUserName) return;
    supabase.from("notifications").insert([{
      user_id: recipientId,
      actor_id: currentUserId,
      actor_name: currentUserName,
      type: "activity",
      message,
      post_owner_id: postOwnerId,
    }]);
  }

  async function toggleLike(postId: string, isLiked: boolean) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    try {
      setTogglingLikeFor(postId);
      if (isLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId);
      } else {
        await supabase.from("post_likes").insert([{ post_id: postId, user_id: currentUserId }]);
        if (profile && currentUserId !== profile.user_id) {
          notify(profile.user_id, `${currentUserName} liked your post`, profile.user_id);
        }
      }
      if (userId) await loadPosts(userId);
    } finally { setTogglingLikeFor(null); }
  }

  async function toggleCommentLike(commentId: string, isLiked: boolean) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    try {
      setTogglingCommentLikeFor(commentId);
      if (isLiked) {
        await supabase.from("post_comment_likes").delete().eq("comment_id", commentId).eq("user_id", currentUserId);
      } else {
        await supabase.from("post_comment_likes").insert([{ comment_id: commentId, user_id: currentUserId }]);
      }
      if (userId) await loadPosts(userId);
    } finally { setTogglingCommentLikeFor(null); }
  }

  async function submitComment(postId: string) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    const text = (commentInputs[postId] || "").trim();
    if (!text) return;
    try {
      setSubmittingCommentFor(postId);
      await supabase.from("post_comments").insert([{ post_id: postId, user_id: currentUserId, content: text }]);
      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      setExpandedComments((prev) => ({ ...prev, [postId]: true }));
      if (profile && currentUserId !== profile.user_id) {
        notify(profile.user_id, `${currentUserName} commented on your post`, profile.user_id);
      }
      supabase.from("post_comments").select("user_id").eq("post_id", postId).neq("user_id", currentUserId).then(({ data: td }) => {
        const participants = [...new Set(((td ?? []) as { user_id: string }[]).map((c) => c.user_id))].filter((id) => id !== profile?.user_id);
        participants.forEach((pid) => notify(pid, `${currentUserName} also commented on a post you're following`, profile?.user_id ?? pid));
      });
      if (userId) await loadPosts(userId);
    } finally { setSubmittingCommentFor(null); }
  }

  async function deleteWallPost(postId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Delete this post?")) return;
    try {
      setDeletingPostId(postId);
      await supabase.from("posts").delete().eq("id", postId);
      if (userId) await loadPosts(userId);
    } finally { setDeletingPostId(null); }
  }

  async function deleteWallComment(commentId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Delete this comment?")) return;
    try {
      setDeletingCommentId(commentId);
      await supabase.from("post_comments").delete().eq("id", commentId);
      if (userId) await loadPosts(userId);
    } finally { setDeletingCommentId(null); }
  }

  async function loadPhotos(targetUserId: string): Promise<ProfilePhoto[]> {
    const { data, error } = await supabase
      .from("profile_photos")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Profile photos load error:", error);
      return [];
    }

    const result = (data as ProfilePhoto[]) ?? [];
    setPhotos(result);
    return result;
  }

  async function loadPhotoInteractions(photoIds: string[], signedInUserId?: string | null) {
    if (photoIds.length === 0) return;
    const uid = signedInUserId ?? currentUserId;

    const [likesResult, commentsResult] = await Promise.all([
      supabase.from("profile_photo_likes").select("photo_id, user_id").in("photo_id", photoIds),
      supabase.from("profile_photo_comments").select("id, photo_id, user_id, content, created_at").in("photo_id", photoIds).order("created_at", { ascending: true }),
    ]);

    const likesByPhoto = new Map<string, string[]>();
    ((likesResult.data ?? []) as { photo_id: string; user_id: string }[]).forEach((r) => {
      const arr = likesByPhoto.get(r.photo_id) || [];
      arr.push(r.user_id);
      likesByPhoto.set(r.photo_id, arr);
    });

    const rawComments = (commentsResult.data ?? []) as { id: string; photo_id: string; user_id: string; content: string; created_at: string }[];
    const authorIds = [...new Set(rawComments.map((c) => c.user_id))];
    const { data: authorData } = authorIds.length > 0
      ? await supabase.from("profiles").select("user_id, first_name, last_name, photo_url").in("user_id", authorIds)
      : { data: [] };

    const nameMap = new Map<string, string>();
    const photoMap = new Map<string, string | null>();
    ((authorData ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null }[]).forEach((p) => {
      nameMap.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "User");
      photoMap.set(p.user_id, p.photo_url ?? null);
    });

    const newComments: Record<string, PhotoComment[]> = {};
    rawComments.forEach((c) => {
      if (!newComments[c.photo_id]) newComments[c.photo_id] = [];
      newComments[c.photo_id].push({ ...c, authorName: nameMap.get(c.user_id) || "User", authorPhotoUrl: photoMap.get(c.user_id) ?? null });
    });

    const newLikes: Record<string, { count: number; likedByMe: boolean }> = {};
    photoIds.forEach((id) => {
      const likers = likesByPhoto.get(id) || [];
      newLikes[id] = { count: likers.length, likedByMe: uid ? likers.includes(uid) : false };
    });

    setPhotoLikes(newLikes);
    setPhotoComments(newComments);
  }

  async function togglePhotoLike(photoId: string) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    const isLiked = photoLikes[photoId]?.likedByMe ?? false;
    try {
      setTogglingPhotoLikeFor(photoId);
      if (isLiked) {
        await supabase.from("profile_photo_likes").delete().eq("photo_id", photoId).eq("user_id", currentUserId);
      } else {
        await supabase.from("profile_photo_likes").insert([{ photo_id: photoId, user_id: currentUserId }]);
      }
      await loadPhotoInteractions(photos.map((p) => p.id));
    } finally { setTogglingPhotoLikeFor(null); }
  }

  async function submitPhotoComment(photoId: string) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    const text = photoCommentInput.trim();
    if (!text) return;
    try {
      setSubmittingPhotoComment(true);
      await supabase.from("profile_photo_comments").insert([{ photo_id: photoId, user_id: currentUserId, content: text }]);
      setPhotoCommentInput("");
      await loadPhotoInteractions(photos.map((p) => p.id));
    } finally { setSubmittingPhotoComment(false); }
  }

  async function loadConnections(targetUserId: string, signedInUserId?: string | null) {
    const effectiveCurrentUserId = signedInUserId ?? currentUserId;

    const { data, error } = await supabase
      .from("profile_connections")
      .select("requester_user_id, target_user_id, connection_type")
      .eq("target_user_id", targetUserId);

    if (error) {
      console.error("Profile connections load error:", error);
      return;
    }

    const rows =
      (data as {
        requester_user_id: string;
        target_user_id: string;
        connection_type: ConnectionType;
      }[]) ?? [];

    const workedWithRows = rows.filter((row) => row.connection_type === "worked_with");
    const knowRows = rows.filter((row) => row.connection_type === "know");

    setWorkedWithCount(workedWithRows.length);
    setKnowCount(knowRows.length);

    if (!effectiveCurrentUserId) {
      setCurrentUserWorkedWith(false);
      setCurrentUserKnows(false);
      return;
    }

    setCurrentUserWorkedWith(
      workedWithRows.some((row) => row.requester_user_id === effectiveCurrentUserId)
    );

    setCurrentUserKnows(
      knowRows.some((row) => row.requester_user_id === effectiveCurrentUserId)
    );
  }

  function handlePostContentChange(value: string) {
    setPostContent(value);
    const url = extractFirstUrl(value);
    if (!url) { setOgPreview(null); return; }
    if (ogPreview?.url === url) return;
    if (ogDebounceRef.current) clearTimeout(ogDebounceRef.current);
    ogDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingOg(true);
        const res = await fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        if (res.ok) {
          const data = await res.json();
          if (data.title || data.image) setOgPreview({ url, title: data.title ?? null, description: data.description ?? null, image: data.image ?? null, siteName: data.siteName ?? null });
          else setOgPreview(null);
        }
      } catch { /* ignore */ } finally { setFetchingOg(false); }
    }, 800);
  }

  async function uploadWallImage(file: File, postId: string): Promise<string> {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const filePath = `${currentUserId}/posts/${postId}/${safeName}`;
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
  }

  async function submitPost() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (!userId || (!postContent.trim() && selectedPostImages.length === 0)) return;

    try {
      setSubmittingPost(true);
      const currentOg = ogPreview;
      const imagesToUpload = [...selectedPostImages];

      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert([{
          user_id: currentUserId,
          content: postContent.trim(),
          og_url: currentOg?.url ?? null,
          og_title: currentOg?.title ?? null,
          og_description: currentOg?.description ?? null,
          og_image: currentOg?.image ?? null,
          og_site_name: currentOg?.siteName ?? null,
        }])
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        alert(insertError?.message || "Failed to create post.");
        return;
      }

      const postId = inserted.id;

      if (imagesToUpload.length > 0) {
        const uploadedUrls: string[] = [];
        for (const item of imagesToUpload) {
          const url = await uploadWallImage(item.file, postId);
          uploadedUrls.push(url);
        }
        await supabase.from("post_images").insert(
          uploadedUrls.map((url, i) => ({
            post_id: postId,
            image_url: url,
            sort_order: i,
            file_type: imagesToUpload[i]?.file.type.startsWith("video/") ? "video" : "image",
          }))
        );
        await supabase.from("posts").update({ image_url: uploadedUrls[0] }).eq("id", postId);
      }

      setPostContent("");
      setOgPreview(null);
      setSelectedPostImages((prev) => { prev.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; });
      await loadPosts(userId);
    } catch (err) {
      console.error("Submit post error:", err);
      alert("Failed to create post");
    } finally {
      setSubmittingPost(false);
    }
  }

  async function toggleConnection(type: ConnectionType) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (!userId || currentUserId === userId) return;

    const isActive = type === "worked_with" ? currentUserWorkedWith : currentUserKnows;

    try {
      setTogglingConnection(type);

      if (isActive) {
        const { error } = await supabase
          .from("profile_connections")
          .delete()
          .eq("requester_user_id", currentUserId)
          .eq("target_user_id", userId)
          .eq("connection_type", type);

        if (error) {
          alert(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("profile_connections").insert([
          {
            requester_user_id: currentUserId,
            target_user_id: userId,
            connection_type: type,
          },
        ]);

        if (error) {
          alert(error.message);
          return;
        }
      }

      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Toggle connection error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!currentUserId || !userId || currentUserId !== userId) return;

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingGallery(true);

      const filePath = `${currentUserId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-gallery")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("profile-gallery")
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      const { error: insertError } = await supabase.from("profile_photos").insert([
        {
          user_id: currentUserId,
          photo_url: publicUrl,
        },
      ]);

      if (insertError) throw insertError;

      await loadPhotos(currentUserId);
    } catch (err) {
      console.error("Gallery upload failed:", err);
      alert("Gallery upload failed");
    } finally {
      setUploadingGallery(false);
      e.target.value = "";
    }
  }

  async function togglePinned(photo: ProfilePhoto) {
    if (!currentUserId || currentUserId !== photo.user_id) return;

    try {
      setTogglingPinnedId(photo.id);

      if (!photo.is_pinned) {
        const pinnedCount = photos.filter((p) => p.is_pinned).length;

        if (pinnedCount >= 4) {
          alert("You can only pin up to 4 photos");
          return;
        }
      }

      const { error } = await supabase
        .from("profile_photos")
        .update({ is_pinned: !photo.is_pinned })
        .eq("id", photo.id);

      if (error) throw error;

      await loadPhotos(currentUserId);
    } catch (err) {
      console.error("Toggle pinned failed:", err);
      alert("Failed to update pinned photo");
    } finally {
      setTogglingPinnedId(null);
    }
  }

  async function deletePhoto(photo: ProfilePhoto) {
    if (!currentUserId || currentUserId !== photo.user_id) return;
    if (!window.confirm("Delete this photo?")) return;

    try {
      setDeletingPhotoId(photo.id);

      const { error } = await supabase
        .from("profile_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      await loadPhotos(currentUserId);
    } catch (err) {
      console.error("Delete photo failed:", err);
      alert("Failed to delete photo");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth <= 900); }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    async function init() {
      if (!userId || userId === "undefined") {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error("Auth error:", error);
      }

      const signedInUserId = data.user?.id ?? null;
      setCurrentUserId(signedInUserId);

      if (signedInUserId) {
        const { data: nameData } = await supabase.from("profiles").select("first_name, last_name").eq("user_id", signedInUserId).maybeSingle();
        const nd = nameData as { first_name: string | null; last_name: string | null } | null;
        setCurrentUserName(`${nd?.first_name || ""} ${nd?.last_name || ""}`.trim() || "Someone");

        // Load unread message count for own wall badge
        if (signedInUserId === userId) {
          const convs = await supabase.from("conversations").select("id").or(`participant_1.eq.${signedInUserId},participant_2.eq.${signedInUserId}`);
          const convIds = (convs.data ?? []).map((c: { id: string }) => c.id);
          if (convIds.length > 0) {
            const { count } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("is_read", false).neq("sender_id", signedInUserId).in("conversation_id", convIds);
            setUnreadMessages(count ?? 0);
          }
        }
      }

      const [,, photoResults] = await Promise.all([
        loadProfile(userId),
        loadPosts(userId),
        loadPhotos(userId),
        loadConnections(userId, signedInUserId),
      ]);
      await loadPhotoInteractions((photoResults ?? []).map((p) => p.id), signedInUserId);

      setLoading(false);
    }

    init();
  }, [userId]);

  useEffect(() => {
    if (!userId || userId === "undefined") return;

    const postsChannel = supabase
      .channel(`profile-posts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => {
          loadPosts(userId);
        }
      )
      .subscribe();

    const connectionsChannel = supabase
      .channel(`profile-connections-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_connections" },
        () => {
          loadConnections(userId);
        }
      )
      .subscribe();

    const photosChannel = supabase
      .channel(`profile-photos-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_photos" },
        () => {
          loadPhotos(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(connectionsChannel);
      supabase.removeChannel(photosChannel);
    };
  }, [userId, currentUserId]);

  if (!loading && !profile) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <NavBar />
        <div style={{ marginTop: 20 }}>Profile not found.</div>
      </div>
    );
  }

  const skeletonBase: React.CSSProperties = {
    background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  const fullName = profile
    ? profile.display_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User"
    : "";

  const techTypesText = profile
    ? Array.isArray(profile.tech_types) ? profile.tech_types.join(", ") : profile.tech_types || "Not added yet"
    : "";

  const isOwnWall = currentUserId === profile?.user_id;
  const wastaScore = workedWithCount + knowCount;

  const pinnedPhotos = photos.filter((photo) => photo.is_pinned).slice(0, 4);
  const galleryPhotos = photos.filter((photo) => !photo.is_pinned);

  return (
    <>
    <div style={{ padding: "24px 16px", background: t.bg, minHeight: "100vh", color: t.text }}>
      <NavBar />

      {/* Mobile unread messages banner — own wall only */}
      {isMobile && isOwnWall && (
        <a
          href="/messages"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
            padding: "11px 16px",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: t.surface,
            textDecoration: "none",
            color: t.text,
            fontWeight: 700,
            fontSize: 14,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <span>My Messages</span>
          <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 20, height: 20, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>
            {unreadMessages > 9 ? "9+" : unreadMessages}
          </span>
        </a>
      )}

      {/* Skeleton while loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, background: t.surface }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ ...skeletonBase, width: 100, height: 100, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ ...skeletonBase, height: 24, width: "40%", marginBottom: 10 }} />
                <div style={{ ...skeletonBase, height: 14, width: "30%", marginBottom: 8 }} />
                <div style={{ ...skeletonBase, height: 14, width: "60%" }} />
              </div>
            </div>
          </div>
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: 16, background: t.surface, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ ...skeletonBase, height: 14, width: 56, flexShrink: 0 }} />
            {[1,2,3,4].map((i) => <div key={i} style={{ ...skeletonBase, width: 100, height: 100, borderRadius: 10, flexShrink: 0 }} />)}
          </div>
          {[1,2,3].map((i) => (
            <div key={i} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ ...skeletonBase, width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...skeletonBase, height: 14, width: "30%", marginBottom: 6 }} />
                  <div style={{ ...skeletonBase, height: 11, width: "20%" }} />
                </div>
              </div>
              <div style={{ ...skeletonBase, height: 13, marginBottom: 6 }} />
              <div style={{ ...skeletonBase, height: 13, width: "75%", marginBottom: 6 }} />
              <div style={{ ...skeletonBase, height: 13, width: "50%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Single-column page layout */}
      {!loading && profile && <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>

        {false && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Photos</div>
            {isOwnWall && (
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: "5px 10px",
                    background: t.surface,
                    color: t.text,
                  }}
                >
                  + Add
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryUpload}
                    style={{ display: "none" }}
                  />
                </label>
                {uploadingGallery && (
                  <div style={{ marginTop: 6, color: t.textMuted, fontSize: 12 }}>Uploading...</div>
                )}
              </div>
            )}
          </div>

          {/* Pinned Photos */}
          {pinnedPhotos.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Pinned
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {pinnedPhotos.map((photo) => (
                  <div key={photo.id}>
                    <div
                      onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                      style={{
                        aspectRatio: "1 / 1",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: t.bg,
                        cursor: "pointer",
                      }}
                    >
                      <img
                        src={photo.photo_url}
                        alt="Pinned photo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    {isOwnWall && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                        <button
                          onClick={() => togglePinned(photo)}
                          disabled={togglingPinnedId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer",
                            opacity: togglingPinnedId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {togglingPinnedId === photo.id ? "..." : "Unpin"}
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer",
                            opacity: deletingPhotoId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {deletingPhotoId === photo.id ? "..." : "Del"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {pinnedPhotos.length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 16 }}>No pinned photos.</div>
          )}

          {/* Gallery Photos */}
          {galleryPhotos.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Gallery
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {galleryPhotos.map((photo) => (
                  <div key={photo.id}>
                    <div
                      onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                      style={{
                        aspectRatio: "1 / 1",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: t.bg,
                        cursor: "pointer",
                      }}
                    >
                      <img
                        src={photo.photo_url}
                        alt="Gallery photo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    {isOwnWall && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                        <button
                          onClick={() => togglePinned(photo)}
                          disabled={togglingPinnedId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer",
                            opacity: togglingPinnedId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {togglingPinnedId === photo.id ? "..." : "Pin"}
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer",
                            opacity: deletingPhotoId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {deletingPhotoId === photo.id ? "..." : "Del"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {galleryPhotos.length === 0 && pinnedPhotos.length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13 }}>No photos yet.</div>
          )}
        </div>}

        {/* ── Content ── */}

          {/* Profile / Contact Card */}
          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 24,
              background: t.surface,
            }}
          >
            {isMobile ? (
              /* ── Mobile profile card layout ── */
              <div>
                {/* Top row: avatar + name + stats */}
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 76, height: 76, borderRadius: "50%", overflow: "hidden", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, flexShrink: 0, boxSizing: "border-box", border: getServiceRingColor(profile.service) ? `3px solid ${getServiceRingColor(profile.service)}` : undefined }}>
                    {profile.photo_url
                      ? <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : fullName[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, lineHeight: 1.2 }}>{fullName}</h1>
                    <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2 }}>{isOwnWall ? "My Profile" : "Member Profile"}</div>
                    <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 900, fontSize: 17 }}>{workedWithCount}</div>
                        <div style={{ fontSize: 10, color: t.textMuted }}>Worked With</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 900, fontSize: 17 }}>{knowCount}</div>
                        <div style={{ fontSize: 10, color: t.textMuted }}>Know</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 900, fontSize: 17 }}>{wastaScore}</div>
                        <div style={{ fontSize: 10, color: t.textMuted }}>Wasta</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connection buttons */}
                {!isOwnWall && currentUserId && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="button" onClick={() => toggleConnection("worked_with")} disabled={togglingConnection === "worked_with"} style={{ flex: 1, background: currentUserWorkedWith ? "#111" : t.surface, color: currentUserWorkedWith ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: togglingConnection === "worked_with" ? "not-allowed" : "pointer", opacity: togglingConnection === "worked_with" ? 0.7 : 1 }}>
                      {togglingConnection === "worked_with" ? "Saving..." : currentUserWorkedWith ? "Worked With ✓" : "Worked With"}
                    </button>
                    <button type="button" onClick={() => toggleConnection("know")} disabled={togglingConnection === "know"} style={{ flex: 1, background: currentUserKnows ? "#111" : t.surface, color: currentUserKnows ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: togglingConnection === "know" ? "not-allowed" : "pointer", opacity: togglingConnection === "know" ? 0.7 : 1 }}>
                      {togglingConnection === "know" ? "Saving..." : currentUserKnows ? "Know ✓" : "Know"}
                    </button>
                    <a href={`/messages?with=${userId}`} style={{ flex: 1, background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      Message
                    </a>
                  </div>
                )}

                {/* Profile details — full width below */}
                <div style={{ marginTop: 14, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, color: t.textMuted, fontSize: 14, lineHeight: 1.7 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                    <div><strong>Role:</strong> {profile.role || "—"}</div>
                    <div><strong>Service:</strong> {profile.service || "—"}</div>
                    <div><strong>Status:</strong> {profile.status || "—"}</div>
                    <div><strong>Experience:</strong> {profile.years_experience || "—"}</div>
                    <div><strong>Badge:</strong> {profile.skill_badge || "—"}</div>
                    <div><strong>Verified:</strong> {profile.verification_status || "—"}</div>
                  </div>
                  {profile.bio && (
                    <div style={{ marginTop: 12, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, color: t.textMuted, lineHeight: 1.6 }}>
                      {profile.bio}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Desktop profile card layout ── */
              <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                {/* Identity: photo + name + stats + buttons */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0, width: 180 }}>
                  <div style={{ width: 120, height: 120, borderRadius: "50%", overflow: "hidden", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, boxSizing: "border-box", border: getServiceRingColor(profile.service) ? `4px solid ${getServiceRingColor(profile.service)}` : undefined }}>
                    {profile.photo_url ? (
                      <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : ("Photo")}
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{fullName}</h1>
                    <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>{isOwnWall ? "My Profile" : "Member Profile"}</div>
                  </div>

                  <div style={{ display: "flex", gap: 16, justifyContent: "center", width: "100%" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 20 }}>{workedWithCount}</div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>Worked With</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 20 }}>{knowCount}</div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>Know</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 20 }}>{wastaScore}</div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>Wasta</div>
                    </div>
                  </div>

                  {!isOwnWall && currentUserId && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                      <button type="button" onClick={() => toggleConnection("worked_with")} disabled={togglingConnection === "worked_with"} style={{ background: currentUserWorkedWith ? "#111" : t.surface, color: currentUserWorkedWith ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: togglingConnection === "worked_with" ? "not-allowed" : "pointer", opacity: togglingConnection === "worked_with" ? 0.7 : 1, width: "100%" }}>
                        {togglingConnection === "worked_with" ? "Saving..." : currentUserWorkedWith ? "Worked With ✓" : "Worked With"}
                      </button>
                      <button type="button" onClick={() => toggleConnection("know")} disabled={togglingConnection === "know"} style={{ background: currentUserKnows ? "#111" : t.surface, color: currentUserKnows ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: togglingConnection === "know" ? "not-allowed" : "pointer", opacity: togglingConnection === "know" ? 0.7 : 1, width: "100%" }}>
                        {togglingConnection === "know" ? "Saving..." : currentUserKnows ? "Know ✓" : "Know"}
                      </button>
                      <a href={`/messages?with=${userId}`} style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block", width: "100%", boxSizing: "border-box" }}>
                        Message
                      </a>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{ width: 1, alignSelf: "stretch", background: t.border, flexShrink: 0 }} />

                {/* Profile details */}
                <div style={{ flex: 1, color: t.textMuted, lineHeight: 1.8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                    <div><strong>Role:</strong> {profile.role || "Not added yet"}</div>
                    <div><strong>Service:</strong> {profile.service || "Not added yet"}</div>
                    <div><strong>Status:</strong> {profile.status || "Not added yet"}</div>
                    <div><strong>Years Experience:</strong> {profile.years_experience || "Not added yet"}</div>
                    <div><strong>Skill Badge:</strong> {profile.skill_badge || "Not added yet"}</div>
                    <div><strong>Verification:</strong> {profile.verification_status || "Not verified"}</div>
                  </div>
                  {profile.bio && (
                    <div style={{ marginTop: 14, color: t.textMuted, lineHeight: 1.6, borderTop: `1px solid ${t.borderLight}`, paddingTop: 14 }}>
                      {profile.bio}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Photo Strip ── */}
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, overflow: "hidden" }}>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Title row */}
              <div style={{ fontSize: 15, fontWeight: 900 }}>Photos</div>

              {/* Pinned photos — horizontal scroll, full width */}
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {pinnedPhotos.length === 0 && (
                  <div style={{ color: t.textFaint, fontSize: 13, alignSelf: "center" }}>
                    {photos.length > 0 ? "Pin photos from the gallery to feature them here." : "No photos yet."}
                  </div>
                )}
                {pinnedPhotos.map((photo) => (
                  <div key={photo.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                      style={{ width: 100, height: 100, borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                    >
                      <img src={photo.photo_url} alt="Pinned" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    {isOwnWall && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => togglePinned(photo)}
                          disabled={togglingPinnedId === photo.id}
                          style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer", opacity: togglingPinnedId === photo.id ? 0.7 : 1, color: t.text }}
                        >
                          {togglingPinnedId === photo.id ? "..." : "Unpin"}
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer", opacity: deletingPhotoId === photo.id ? 0.7 : 1, color: t.text }}
                        >
                          {deletingPhotoId === photo.id ? "..." : "Del"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Controls row — below photos */}
              {(galleryPhotos.length > 0 || isOwnWall) && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {galleryPhotos.length > 0 && (
                    <button
                      onClick={() => setGalleryExpanded(!galleryExpanded)}
                      style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Gallery ({galleryPhotos.length}) {galleryExpanded ? "▲" : "▼"}
                    </button>
                  )}
                  {isOwnWall && (
                    <label style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", background: t.surface, color: t.text, whiteSpace: "nowrap", display: "inline-block" }}>
                      + Add Photo
                      <input type="file" accept="image/*" onChange={handleGalleryUpload} style={{ display: "none" }} />
                    </label>
                  )}
                  {uploadingGallery && <span style={{ fontSize: 12, color: t.textMuted }}>Uploading...</span>}
                </div>
              )}
            </div>

            {/* Expanded gallery grid */}
            {galleryExpanded && galleryPhotos.length > 0 && (
              <div style={{ borderTop: `1px solid ${t.border}`, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Gallery</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                  {galleryPhotos.map((photo) => (
                    <div key={photo.id}>
                      <div
                        onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                        style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                      >
                        <img src={photo.photo_url} alt="Gallery" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      {isOwnWall && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                          <button
                            onClick={() => togglePinned(photo)}
                            disabled={togglingPinnedId === photo.id}
                            style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer", opacity: togglingPinnedId === photo.id ? 0.7 : 1 }}
                          >
                            {togglingPinnedId === photo.id ? "..." : "Pin"}
                          </button>
                          <button
                            onClick={() => deletePhoto(photo)}
                            disabled={deletingPhotoId === photo.id}
                            style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer", opacity: deletingPhotoId === photo.id ? 0.7 : 1 }}
                          >
                            {deletingPhotoId === photo.id ? "..." : "Del"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Wall */}
          <div style={{ paddingTop: 4 }}>

            {isOwnWall && (
              <div style={{ marginTop: 16, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                <textarea
                  placeholder="Post to your wall..."
                  value={postContent}
                  onChange={(e) => handlePostContentChange(e.target.value)}
                  style={{ width: "100%", minHeight: 80, border: "none", outline: "none", resize: "vertical", fontSize: 16, boxSizing: "border-box", background: t.input, color: t.text }}
                />

                {fetchingOg && <div style={{ fontSize: 12, color: t.textFaint, marginTop: 4 }}>Fetching link preview...</div>}
                {ogPreview && (
                  <div style={{ position: "relative" }}>
                    <OgCard og={ogPreview} />
                    <button type="button" onClick={() => setOgPreview(null)} style={{ position: "absolute", top: 20, right: 8, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={postImageInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
                    const oversized = files.filter((f) => f.type.startsWith("video/") && f.size > MAX_VIDEO_BYTES);
                    if (oversized.length > 0) {
                      alert(`Video files must be under 200 MB. "${oversized[0].name}" is too large.`);
                      if (postImageInputRef.current) postImageInputRef.current.value = "";
                      return;
                    }
                    setSelectedPostImages((prev) => {
                      const slots = 10 - prev.length;
                      const toAdd = files.slice(0, slots).map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }));
                      return [...prev, ...toAdd];
                    });
                    if (postImageInputRef.current) postImageInputRef.current.value = "";
                  }}
                  style={{ display: "none" }}
                />

                {/* Image previews */}
                {selectedPostImages.length > 0 && (
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {selectedPostImages.map((item, i) => (
                      <div key={i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, background: t.bg }}>
                        {item.file.type.startsWith("video/") ? (
                          <video src={item.previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : item.file.type === "application/pdf" ? (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, fontSize: 11, color: t.textMuted }}>
                            <span style={{ fontSize: 28 }}>📄</span>
                            <span style={{ textAlign: "center", padding: "0 4px", wordBreak: "break-all" }}>{item.file.name}</span>
                          </div>
                        ) : (
                          <img src={item.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPostImages((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); })}
                          style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    {selectedPostImages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPostImages((prev) => { prev.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; })}
                        style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 12px", fontWeight: 700, cursor: "pointer", color: t.text }}
                      >
                        Remove All Photos
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => postImageInputRef.current?.click()}
                      style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {selectedPostImages.length > 0 ? "Add More Photos" : "Add Photo"}
                    </button>
                    <button
                      onClick={submitPost}
                      disabled={submittingPost}
                      style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: submittingPost ? "not-allowed" : "pointer", opacity: submittingPost ? 0.7 : 1 }}
                    >
                      {submittingPost ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
              {posts.length === 0 && <div style={{ color: t.textMuted }}>No wall posts yet.</div>}

              {posts.map((post) => {
                const commentsOpen = expandedComments[post.id] || false;
                const isOwnPost = currentUserId === post.user_id;

                return (
                  <div key={post.id} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                    {/* Post header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", background: t.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, fontSize: 14, boxSizing: "border-box", border: getServiceRingColor(profile.service) ? `3px solid ${getServiceRingColor(profile.service)}` : undefined }}>
                          {profile.photo_url
                            ? <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            : fullName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800 }}>{fullName}</div>
                          <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{formatDate(post.created_at)}</div>
                        </div>
                      </div>
                      {isOwnPost && (
                        <button
                          type="button"
                          onClick={() => deleteWallPost(post.id)}
                          disabled={deletingPostId === post.id}
                          style={{ background: "transparent", border: "none", padding: 0, cursor: deletingPostId === post.id ? "not-allowed" : "pointer", color: t.textMuted, fontWeight: 700, opacity: deletingPostId === post.id ? 0.6 : 1 }}
                        >
                          {deletingPostId === post.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>

                    {/* Post content */}
                    {post.content && <div style={{ marginTop: 10, lineHeight: 1.5 }}>{renderContent(post.content)}</div>}

                    {post.og_url && (post.og_title || post.og_image) && (
                      <OgCard og={{ url: post.og_url, title: post.og_title, description: post.og_description, image: post.og_image, siteName: post.og_site_name }} />
                    )}

                    {/* Post images */}
                    {post.image_urls.length > 0 && (() => {
                      const visible = post.image_urls.slice(0, 3);
                      const remaining = post.image_urls.length - 3;
                      return (
                        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: visible.length === 1 ? "1fr" : visible.length === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 8, maxWidth: 420 }}>
                          {visible.map((url, i) => (
                            <div key={i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, background: t.bg }}>
                              {isVideoUrl(url) ? (
                                <>
                                  <video src={url} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                  {!(i === 2 && remaining > 0) && (
                                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                                      <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <span style={{ color: "white", fontSize: 16, paddingLeft: 2 }}>▶</span>
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <img src={url} alt={`Post image ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              )}
                              {i === 2 && remaining > 0 && (
                                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 24, fontWeight: 800 }}>
                                  +{remaining}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Like / Comment bar */}
                    <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => toggleLike(post.id, post.likedByCurrentUser)}
                        disabled={togglingLikeFor === post.id}
                        style={{ background: "transparent", border: "none", padding: 0, cursor: togglingLikeFor === post.id ? "not-allowed" : "pointer", fontWeight: 700, color: post.likedByCurrentUser ? t.text : t.textMuted, opacity: togglingLikeFor === post.id ? 0.6 : 1 }}
                      >
                        {post.likedByCurrentUser ? "Unlike" : "Like"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: !commentsOpen }))}
                        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: t.textMuted }}
                      >
                        {commentsOpen ? "Hide Comments" : "Comment"}
                      </button>
                      <div style={{ fontSize: 14, color: t.textMuted }}>{post.likeCount} {post.likeCount === 1 ? "like" : "likes"}</div>
                      <div style={{ fontSize: 14, color: t.textMuted }}>{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</div>
                    </div>

                    {/* Comments section */}
                    {commentsOpen && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
                        <div style={{ display: "grid", gap: 12 }}>
                          {post.comments.length === 0 && <div style={{ color: t.textMuted, fontSize: 14 }}>No comments yet.</div>}
                          {post.comments.map((comment) => (
                            <div key={comment.id} style={{ background: t.bg, borderRadius: 10, padding: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                  <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: t.border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: t.textMuted, boxSizing: "border-box", border: getServiceRingColor(comment.authorService) ? `3px solid ${getServiceRingColor(comment.authorService)}` : undefined }}>
                                    {comment.authorPhotoUrl
                                      ? <img src={comment.authorPhotoUrl} alt={comment.authorName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                      : comment.authorName[0]?.toUpperCase()}
                                  </div>
                                  <div>
                                    <Link href={`/profile/${comment.user_id}`} style={{ fontWeight: 700, fontSize: 14, color: t.text, textDecoration: "none" }}>
                                      {comment.authorName}
                                    </Link>
                                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{formatDate(comment.created_at)}</div>
                                  </div>
                                </div>
                                {currentUserId === comment.user_id && (
                                  <button
                                    type="button"
                                    onClick={() => deleteWallComment(comment.id)}
                                    disabled={deletingCommentId === comment.id}
                                    style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: t.textMuted, fontWeight: 700, fontSize: 13, opacity: deletingCommentId === comment.id ? 0.6 : 1 }}
                                  >
                                    {deletingCommentId === comment.id ? "..." : "Delete"}
                                  </button>
                                )}
                              </div>
                              {comment.content && <div style={{ marginTop: 8, lineHeight: 1.5, fontSize: 14 }}>{comment.content}</div>}
                              {comment.image_url && (
                                <div style={{ marginTop: 10, maxWidth: 180, borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}` }}>
                                  <img src={comment.image_url} alt="Comment image" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleCommentLike(comment.id, comment.likedByCurrentUser)}
                                  disabled={togglingCommentLikeFor === comment.id}
                                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 13, color: comment.likedByCurrentUser ? t.text : t.textMuted, opacity: togglingCommentLikeFor === comment.id ? 0.6 : 1 }}
                                >
                                  {comment.likedByCurrentUser ? "Unlike" : "Like"}
                                </button>
                                <div style={{ fontSize: 13, color: t.textMuted }}>{comment.likeCount} {comment.likeCount === 1 ? "like" : "likes"}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add comment input */}
                        <div style={{ marginTop: 14 }}>
                          <textarea
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ""}
                            onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            style={{ width: "100%", minHeight: 60, border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: 10, resize: "vertical", fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                          />
                          <div style={{ marginTop: 8, textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => submitComment(post.id)}
                              disabled={submittingCommentFor === post.id}
                              style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: submittingCommentFor === post.id ? "not-allowed" : "pointer", opacity: submittingCommentFor === post.id ? 0.7 : 1 }}
                            >
                              {submittingCommentFor === post.id ? "Posting..." : "Reply"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
      </div>}
    </div>

    {/* Photo Lightbox Modal */}
    {lightboxPhoto && (
      <div
        onClick={() => setLightboxPhoto(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ background: t.surface, borderRadius: 16, overflow: "hidden", maxWidth: 680, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        >
          {/* Full-size image */}
          <div style={{ position: "relative", background: "#000", flexShrink: 0 }}>
            <img
              src={lightboxPhoto.photo_url}
              alt="Photo"
              style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "contain" }}
            />
            <button
              onClick={() => setLightboxPhoto(null)}
              style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "white", fontWeight: 900, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Interactions panel */}
          <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
            {/* Like bar */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => togglePhotoLike(lightboxPhoto.id)}
                disabled={togglingPhotoLikeFor === lightboxPhoto.id}
                style={{ background: "transparent", border: "none", padding: 0, cursor: togglingPhotoLikeFor === lightboxPhoto.id ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15, color: photoLikes[lightboxPhoto.id]?.likedByMe ? t.text : t.textMuted, opacity: togglingPhotoLikeFor === lightboxPhoto.id ? 0.6 : 1 }}
              >
                {photoLikes[lightboxPhoto.id]?.likedByMe ? "Unlike" : "Like"}
              </button>
              <div style={{ fontSize: 14, color: t.textMuted }}>
                {photoLikes[lightboxPhoto.id]?.count ?? 0} {(photoLikes[lightboxPhoto.id]?.count ?? 0) === 1 ? "like" : "likes"}
              </div>
            </div>

            {/* Comments */}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 15 }}>Comments</div>
              <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                {(photoComments[lightboxPhoto.id] || []).length === 0 && (
                  <div style={{ color: t.textMuted, fontSize: 14 }}>No comments yet.</div>
                )}
                {(photoComments[lightboxPhoto.id] || []).map((c) => (
                  <div key={c.id} style={{ background: t.bg, borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: t.border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                        {c.authorPhotoUrl
                          ? <img src={c.authorPhotoUrl} alt={c.authorName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : c.authorName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.authorName}</div>
                        <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.4 }}>{c.content}</div>
                        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>{formatDate(c.created_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  placeholder="Write a comment..."
                  value={photoCommentInput}
                  onChange={(e) => setPhotoCommentInput(e.target.value)}
                  style={{ flex: 1, minHeight: 52, border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: 10, resize: "none", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: t.input, color: t.text }}
                />
                <button
                  type="button"
                  onClick={() => submitPhotoComment(lightboxPhoto.id)}
                  disabled={submittingPhotoComment}
                  style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: submittingPhotoComment ? "not-allowed" : "pointer", opacity: submittingPhotoComment ? 0.7 : 1, flexShrink: 0 }}
                >
                  {submittingPhotoComment ? "..." : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}