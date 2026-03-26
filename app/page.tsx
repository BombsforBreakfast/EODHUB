"use client";

import Link from "next/link";
import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { supabase } from "./lib/lib/supabaseClient";
import NavBar from "./components/NavBar";

type Job = {
  id: string;
  created_at: string | null;
  title: string | null;
  category: string | null;
  location: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  description: string | null;
  apply_url: string | null;
  company_name: string | null;
  is_approved: boolean | null;
  source_type: string | null;
  user_id: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

type SelectedPostImage = {
  file: File;
  previewUrl: string;
};

type SelectedCommentImage = {
  file: File;
  previewUrl: string;
};

type RankedPostRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  score?: number;
  ranking_score?: number;
};

type LegacyPostImageRow = {
  id: string;
  image_url: string | null;
};

type PostImageRow = {
  id: string;
  post_id: string;
  image_url: string;
  sort_order: number | null;
};

type BusinessListing = {
  id: string;
  created_at: string;
  business_name: string | null;
  website_url: string;
  custom_blurb: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  is_approved: boolean;
  is_featured: boolean;
  like_count: number;
};

type ProfileName = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
};

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

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url: string | null;
};

type LikeRow = {
  post_id: string;
  user_id: string;
};

type CommentLikeRow = {
  comment_id: string;
  user_id: string;
};

type FeedComment = Comment & {
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

type FeedPost = RankedPostRow & {
  image_url: string | null;
  image_urls: string[];
  authorName: string;
  authorPhotoUrl: string | null;
  authorService: string | null;
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
  comments: FeedComment[];
  og_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0].replace(/[.,)>]+$/, "") : null;
}

function renderContent(text: string): React.ReactNode[] {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const url = match[0].replace(/[.,)>]+$/, "");
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}>
        {url}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function OgCard({ og }: { og: OgPreview }) {
  return (
    <a href={og.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#f9fafb", textDecoration: "none", color: "inherit" }}>
      {og.image && (
        <img src={og.image} alt={og.title || ""} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
      )}
      <div style={{ padding: "10px 14px" }}>
        {og.siteName && <div style={{ fontSize: 11, color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{og.siteName}</div>}
        {og.title && <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{og.title}</div>}
        {og.description && <div style={{ fontSize: 13, color: "#555", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{og.description}</div>}
        <div style={{ marginTop: 6, fontSize: 12, color: "#888", wordBreak: "break-all" }}>{og.url}</div>
      </div>
    </a>
  );
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  const combined = [
    maybeError.message,
    maybeError.details,
    maybeError.hint,
    maybeError.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return combined.includes(columnName.toLowerCase());
}

function Avatar({
  photoUrl,
  name,
  size = 44,
  service,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
  service?: string | null;
}) {
  const ringColor = getServiceRingColor(service);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#f3f4f6",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: "#666",
        fontSize: size * 0.32,
        boxSizing: "border-box",
        border: ringColor ? `${size <= 36 ? 3 : 4}px solid ${ringColor}` : undefined,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        (name?.trim()?.[0] || "U").toUpperCase()
      )}
    </div>
  );
}

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [businessListings, setBusinessListings] = useState<BusinessListing[]>(
    []
  );
  const [content, setContent] = useState("");
  const [selectedPostImages, setSelectedPostImages] = useState<
    SelectedPostImage[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [bizLoaded, setBizLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<"feed" | "jobs" | "businesses">("feed");
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  // Biz/Org submission form
  const [showBizForm, setShowBizForm] = useState(false);
  const [bizUrl, setBizUrl] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizBlurb, setBizBlurb] = useState("");
  const [bizOgPreview, setBizOgPreview] = useState<OgPreview | null>(null);
  const [fetchingBizOg, setFetchingBizOg] = useState(false);
  const [submittingBiz, setSubmittingBiz] = useState(false);
  const [bizSubmitSuccess, setBizSubmitSuccess] = useState(false);
  const bizOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [submittingPost, setSubmittingPost] = useState(false);
  const [expandedComments, setExpandedComments] = useState<
    Record<string, boolean>
  >({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [selectedCommentImages, setSelectedCommentImages] = useState<
    Record<string, SelectedCommentImage | null>
  >({});
  const [submittingCommentFor, setSubmittingCommentFor] = useState<
    string | null
  >(null);

  const [likedBizIds, setLikedBizIds] = useState<Set<string>>(new Set());
  const [togglingBizLikeFor, setTogglingBizLikeFor] = useState<string | null>(null);

  const [togglingLikeFor, setTogglingLikeFor] = useState<string | null>(null);
  const [togglingCommentLikeFor, setTogglingCommentLikeFor] = useState<
    string | null
  >(null);

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null
  );

  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [togglingJobSaveFor, setTogglingJobSaveFor] = useState<string | null>(null);

  const [todayMemorials, setTodayMemorials] = useState<{ id: string; name: string; bio: string | null; photo_url: string | null; death_date: string }[]>([]);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);

  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);

  const postImageInputRef = useRef<HTMLInputElement | null>(null);
  const commentImageInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {}
  );
  const ogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPostImagesRef = useRef<SelectedPostImage[]>([]);
  const selectedCommentImagesRef = useRef<
    Record<string, SelectedCommentImage | null>
  >({});

  useEffect(() => {
    selectedPostImagesRef.current = selectedPostImages;
  }, [selectedPostImages]);

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth <= 900); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    selectedCommentImagesRef.current = selectedCommentImages;
  }, [selectedCommentImages]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isGalleryOpen) return;

      if (event.key === "Escape") {
        setIsGalleryOpen(false);
        return;
      }

      if (event.key === "ArrowLeft") {
        setGalleryIndex((prev) =>
          prev === 0 ? galleryImages.length - 1 : prev - 1
        );
        return;
      }

      if (event.key === "ArrowRight") {
        setGalleryIndex((prev) =>
          prev === galleryImages.length - 1 ? 0 : prev + 1
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGalleryOpen, galleryImages.length]);

  async function loadBusinessListings() {
    const { data, error } = await supabase
      .from("business_listings")
      .select("*")
      .eq("is_approved", true)
      .order("is_featured", { ascending: false })
      .order("business_name", { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) {
      console.error("Business listings load error:", error);
      return;
    }

    setBusinessListings((data ?? []) as BusinessListing[]);
    setBizLoaded(true);
  }

  async function loadBizLikes(uid: string) {
    const { data } = await supabase
      .from("business_likes")
      .select("business_id")
      .eq("user_id", uid);
    setLikedBizIds(new Set((data ?? []).map((r: { business_id: string }) => r.business_id)));
  }

  async function handleBizLike(e: React.MouseEvent, bizId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!userId || togglingBizLikeFor === bizId) return;
    setTogglingBizLikeFor(bizId);

    const already = likedBizIds.has(bizId);
    if (already) {
      await supabase.from("business_likes").delete().eq("user_id", userId).eq("business_id", bizId);
      setLikedBizIds((prev) => { const s = new Set(prev); s.delete(bizId); return s; });
      setBusinessListings((prev) => prev.map((b) => b.id === bizId ? { ...b, like_count: Math.max(0, (b.like_count ?? 0) - 1) } : b));
    } else {
      await supabase.from("business_likes").insert({ user_id: userId, business_id: bizId });
      setLikedBizIds((prev) => new Set(prev).add(bizId));
      setBusinessListings((prev) => prev.map((b) => b.id === bizId ? { ...b, like_count: (b.like_count ?? 0) + 1 } : b));
    }
    // Sync accurate count back to DB
    const { count } = await supabase.from("business_likes").select("*", { count: "exact", head: true }).eq("business_id", bizId);
    await supabase.from("business_listings").update({ like_count: count ?? 0 }).eq("id", bizId);

    setTogglingBizLikeFor(null);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Jobs load error:", error);
      return;
    }

    setJobs((data ?? []) as Job[]);
    setJobsLoaded(true);
  }

  async function loadTodayMemorials() {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const { data, error } = await supabase
      .from("memorials")
      .select("id, name, bio, photo_url, death_date");

    if (error) { console.error("Memorials load error:", error); return; }

    const todayAnniversaries = (data ?? []).filter((m: { death_date: string }) => {
      const parts = m.death_date.split("-");
      return parts[1] === mm && parts[2] === dd;
    });

    setTodayMemorials(todayAnniversaries as { id: string; name: string; bio: string | null; photo_url: string | null; death_date: string }[]);
  }

  async function loadSavedJobs(currentUserId: string) {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("job_id")
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Saved jobs load error:", error);
      return;
    }

    setSavedJobIds(new Set((data ?? []).map((r: { job_id: string }) => r.job_id)));
  }

  async function toggleSaveJob(jobId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    try {
      setTogglingJobSaveFor(jobId);
      const isSaved = savedJobIds.has(jobId);

      if (isSaved) {
        await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", jobId);
        setSavedJobIds((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
      } else {
        await supabase.from("saved_jobs").insert([{ user_id: userId, job_id: jobId }]);
        setSavedJobIds((prev) => new Set(prev).add(jobId));
      }
    } catch (err) {
      console.error("Toggle save job error:", err);
    } finally {
      setTogglingJobSaveFor(null);
    }
  }

  async function loadCommentsForPosts(postIds: string[]) {
    const commentsWithImageQuery = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at, image_url")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (!commentsWithImageQuery.error) {
      return {
        comments: (commentsWithImageQuery.data ?? []) as Comment[],
      };
    }

    if (!isMissingColumnError(commentsWithImageQuery.error, "image_url")) {
      console.error("Comments load error:", {
        message: commentsWithImageQuery.error.message,
        details: commentsWithImageQuery.error.details,
        hint: commentsWithImageQuery.error.hint,
        code: commentsWithImageQuery.error.code,
      });

      return {
        comments: [] as Comment[],
      };
    }

    const commentsWithoutImageQuery = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (commentsWithoutImageQuery.error) {
      console.error("Comments fallback load error:", {
        message: commentsWithoutImageQuery.error.message,
        details: commentsWithoutImageQuery.error.details,
        hint: commentsWithoutImageQuery.error.hint,
        code: commentsWithoutImageQuery.error.code,
      });

      return {
        comments: [] as Comment[],
      };
    }

    const normalizedComments: Comment[] = (
      commentsWithoutImageQuery.data ?? []
    ).map((comment) => ({
      ...(comment as Omit<Comment, "image_url">),
      image_url: null,
    }));

    return {
      comments: normalizedComments,
    };
  }

  async function loadPosts(currentUserId?: string | null) {
    const effectiveUserId = currentUserId ?? userId;

    const { data: rankedPostsData, error: postsError } = await supabase
      .from("ranked_posts")
      .select("id, user_id, content, created_at, score, ranking_score")
      .lte("created_at", new Date().toISOString());

    if (postsError) {
      console.error("Feed load error:", postsError);
      return;
    }

    const rawPosts = (rankedPostsData ?? []) as RankedPostRow[];

    if (rawPosts.length === 0) {
      setPosts([]);
      setPostsLoaded(true);
      return;
    }

    const postIds = rawPosts.map((post) => post.id);
    const uniqueUserIds = [...new Set(rawPosts.map((post) => post.user_id))];

    const { data: legacyPostImagesData, error: legacyPostImagesError } =
      await supabase.from("posts").select("id, image_url, og_url, og_title, og_description, og_image, og_site_name").in("id", postIds);

    if (legacyPostImagesError) {
      console.error("Legacy post image load error:", legacyPostImagesError);
    }

    const { data: postImagesData, error: postImagesError } = await supabase
      .from("post_images")
      .select("id, post_id, image_url, sort_order")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (postImagesError) {
      console.error("Post images load error:", postImagesError);
    }

    type LegacyPostRow = LegacyPostImageRow & { og_url?: string | null; og_title?: string | null; og_description?: string | null; og_image?: string | null; og_site_name?: string | null };
    const legacyPostImageMap = new Map<string, string | null>();
    const postOgMap = new Map<string, { og_url: string | null; og_title: string | null; og_description: string | null; og_image: string | null; og_site_name: string | null }>();
    ((legacyPostImagesData ?? []) as LegacyPostRow[]).forEach((row) => {
      legacyPostImageMap.set(row.id, row.image_url ?? null);
      postOgMap.set(row.id, { og_url: row.og_url ?? null, og_title: row.og_title ?? null, og_description: row.og_description ?? null, og_image: row.og_image ?? null, og_site_name: row.og_site_name ?? null });
    });

    const multiPostImageMap = new Map<string, string[]>();
    ((postImagesData ?? []) as PostImageRow[]).forEach((row) => {
      const existing = multiPostImageMap.get(row.post_id) || [];
      existing.push(row.image_url);
      multiPostImageMap.set(row.post_id, existing);
    });

    const { data: likesData, error: likesError } = await supabase
      .from("post_likes")
      .select("post_id, user_id")
      .in("post_id", postIds);

    if (likesError) {
      console.error("Likes load error:", likesError);
    }

    const { comments: rawComments } = await loadCommentsForPosts(postIds);

    const commentIds = rawComments.map((comment) => comment.id);

    const { data: commentLikesData, error: commentLikesError } =
      commentIds.length > 0
        ? await supabase
            .from("post_comment_likes")
            .select("comment_id, user_id")
            .in("comment_id", commentIds)
        : { data: [], error: null };

    if (commentLikesError) {
      console.error("Comment likes load error:", commentLikesError);
    }

    const allProfileUserIds = [
      ...new Set(
        [...uniqueUserIds, ...rawComments.map((comment) => comment.user_id)].filter(
          (id): id is string => Boolean(id)
        )
      ),
    ];

    const { data: profileData, error: profileError } =
      allProfileUserIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, photo_url, service")
            .in("user_id", allProfileUserIds)
        : { data: [], error: null };

    if (profileError) {
      console.error("Profile name load error:", profileError);
    }

    const profileNameMap = new Map<string, string>();
    const profilePhotoMap = new Map<string, string | null>();
    const profileServiceMap = new Map<string, string | null>();

    (profileData as ProfileName[] | null)?.forEach((profile) => {
      const fullName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        "User";

      profileNameMap.set(profile.user_id, fullName);
      profilePhotoMap.set(profile.user_id, profile.photo_url ?? null);
      profileServiceMap.set(profile.user_id, profile.service ?? null);
    });

    const likesByPost = new Map<string, string[]>();
    ((likesData ?? []) as LikeRow[]).forEach((like) => {
      const existing = likesByPost.get(like.post_id) || [];
      existing.push(like.user_id);
      likesByPost.set(like.post_id, existing);
    });

    const likesByComment = new Map<string, string[]>();
    ((commentLikesData ?? []) as CommentLikeRow[]).forEach((like) => {
      const existing = likesByComment.get(like.comment_id) || [];
      existing.push(like.user_id);
      likesByComment.set(like.comment_id, existing);
    });

    const commentsByPost = new Map<string, FeedComment[]>();
    rawComments.forEach((comment) => {
      const existing = commentsByPost.get(comment.post_id) || [];
      const commentLikes = likesByComment.get(comment.id) || [];

      existing.push({
        ...comment,
        authorName: profileNameMap.get(comment.user_id) || "User",
        authorPhotoUrl: profilePhotoMap.get(comment.user_id) || null,
        authorService: profileServiceMap.get(comment.user_id) ?? null,
        likeCount: commentLikes.length,
        likedByCurrentUser: effectiveUserId
          ? commentLikes.includes(effectiveUserId)
          : false,
      });

      commentsByPost.set(comment.post_id, existing);
    });

    const mergedPosts: FeedPost[] = rawPosts.map((post) => {
      const likesForPost = likesByPost.get(post.id) || [];
      const commentsForPost = commentsByPost.get(post.id) || [];
      const multiImages = multiPostImageMap.get(post.id) || [];
      const legacyImage = legacyPostImageMap.get(post.id) ?? null;
      const ogData = postOgMap.get(post.id);

      return {
        ...post,
        image_url: legacyImage,
        image_urls:
          multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        authorName: profileNameMap.get(post.user_id) || "User",
        authorPhotoUrl: profilePhotoMap.get(post.user_id) || null,
        authorService: profileServiceMap.get(post.user_id) ?? null,
        likeCount: likesForPost.length,
        commentCount: commentsForPost.length,
        likedByCurrentUser: effectiveUserId
          ? likesForPost.includes(effectiveUserId)
          : false,
        comments: commentsForPost,
        og_url: ogData?.og_url ?? null,
        og_title: ogData?.og_title ?? null,
        og_description: ogData?.og_description ?? null,
        og_image: ogData?.og_image ?? null,
        og_site_name: ogData?.og_site_name ?? null,
      };
    });

    setPosts(mergedPosts);
    setPostsLoaded(true);
  }

  function openPostImagePicker() {
    postImageInputRef.current?.click();
  }

  function openGallery(images: string[], startIndex: number) {
    setGalleryImages(images);
    setGalleryIndex(startIndex);
    setIsGalleryOpen(true);
  }

  function closeGallery() {
    setIsGalleryOpen(false);
  }

  function showPrevGalleryImage() {
    setGalleryIndex((prev) =>
      prev === 0 ? galleryImages.length - 1 : prev - 1
    );
  }

  function showNextGalleryImage() {
    setGalleryIndex((prev) =>
      prev === galleryImages.length - 1 ? 0 : prev + 1
    );
  }

  function handlePostImageChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setSelectedPostImages((prev) => {
      const remainingSlots = 10 - prev.length;

      if (remainingSlots <= 0) {
        alert("You can upload up to 10 images per post.");
        return prev;
      }

      const filesToAdd = files.slice(0, remainingSlots);

      if (files.length > remainingSlots) {
        alert("Only the first images were added. Max is 10 per post.");
      }

      const newItems = filesToAdd.map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      return [...prev, ...newItems];
    });

    if (postImageInputRef.current) {
      postImageInputRef.current.value = "";
    }
  }

  function removeSelectedPostImage(indexToRemove: number) {
    setSelectedPostImages((prev) => {
      const itemToRemove = prev[indexToRemove];
      if (itemToRemove) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }

      return prev.filter((_, index) => index !== indexToRemove);
    });
  }

  function clearSelectedPostImages() {
    setSelectedPostImages((prev) => {
      prev.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });

    if (postImageInputRef.current) {
      postImageInputRef.current.value = "";
    }
  }

  function handleContentChange(value: string) {
    setContent(value);
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

  function openCommentImagePicker(postId: string) {
    commentImageInputRefs.current[postId]?.click();
  }

  function handleCommentImageChange(
    postId: string,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedCommentImages((prev) => {
      const existing = prev[postId];
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      return {
        ...prev,
        [postId]: {
          file,
          previewUrl: URL.createObjectURL(file),
        },
      };
    });

    if (commentImageInputRefs.current[postId]) {
      commentImageInputRefs.current[postId]!.value = "";
    }
  }

  function clearSelectedCommentImage(postId: string) {
    setSelectedCommentImages((prev) => {
      const existing = prev[postId];
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      return {
        ...prev,
        [postId]: null,
      };
    });

    if (commentImageInputRefs.current[postId]) {
      commentImageInputRefs.current[postId]!.value = "";
    }
  }

  async function uploadFileToFeedImagesBucket(
    file: File,
    pathPrefix: string
  ): Promise<string> {
    const safeFileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${file.name}`;
    const filePath = `${pathPrefix}/${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("feed-images")
      .upload(filePath, file, {
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from("feed-images").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function submitPost() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    if (!content.trim() && selectedPostImages.length === 0) return;

    try {
      setSubmittingPost(true);

      const contentToPost = content.trim();
      const imagesToUpload = [...selectedPostImages];

      const currentOg = ogPreview;
      const { data: insertedPost, error: insertError } = await supabase
        .from("posts")
        .insert([
          {
            user_id: userId,
            content: contentToPost,
            image_url: null,
            og_url: currentOg?.url ?? null,
            og_title: currentOg?.title ?? null,
            og_description: currentOg?.description ?? null,
            og_image: currentOg?.image ?? null,
            og_site_name: currentOg?.siteName ?? null,
          },
        ])
        .select("id")
        .single();

      if (insertError || !insertedPost?.id) {
        console.error("INSERT ERROR:", insertError);
        alert(insertError?.message || "Failed to create post.");
        return;
      }

      const postId = insertedPost.id;
      const uploadedUrls: string[] = [];

      for (let i = 0; i < imagesToUpload.length; i += 1) {
        const item = imagesToUpload[i];
        const publicUrl = await uploadFileToFeedImagesBucket(
          item.file,
          `${userId}/posts/${postId}`
        );
        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        const postImageRows = uploadedUrls.map((url, index) => ({
          post_id: postId,
          image_url: url,
          sort_order: index,
        }));

        const { error: postImagesInsertError } = await supabase
          .from("post_images")
          .insert(postImageRows);

        if (postImagesInsertError) {
          console.error("POST IMAGES INSERT ERROR:", postImagesInsertError);
          alert(postImagesInsertError.message);
          return;
        }

        const { error: legacyUpdateError } = await supabase
          .from("posts")
          .update({ image_url: uploadedUrls[0] })
          .eq("id", postId);

        if (legacyUpdateError) {
          console.error("LEGACY IMAGE UPDATE ERROR:", legacyUpdateError);
        }
      }

      setContent("");
      setOgPreview(null);
      clearSelectedPostImages();
      setSubmittingPost(false);

      void loadPosts();
    } catch (err) {
      console.error("submitPost crashed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Something went wrong while posting."
      );
      setSubmittingPost(false);
    }
  }

  function handleBizUrlChange(value: string) {
    setBizUrl(value);
    setBizOgPreview(null);
    const url = extractFirstUrl(value);
    if (!url) return;
    if (bizOgDebounceRef.current) clearTimeout(bizOgDebounceRef.current);
    bizOgDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingBizOg(true);
        const res = await fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        if (res.ok) {
          const data = await res.json();
          setBizOgPreview({ url, title: data.title ?? null, description: data.description ?? null, image: data.image ?? null, siteName: data.siteName ?? null });
          if (!bizName && (data.title || data.siteName)) setBizName(data.title || data.siteName || "");
          if (!bizBlurb && data.description) setBizBlurb(data.description);
        }
      } catch { /* ignore */ } finally { setFetchingBizOg(false); }
    }, 800);
  }

  async function submitBizListing() {
    if (!userId) { window.location.href = "/login"; return; }
    const url = bizUrl.trim();
    if (!url || !bizName.trim()) return;
    try {
      setSubmittingBiz(true);
      const { error } = await supabase.from("business_listings").insert([{
        website_url: url,
        business_name: bizName.trim(),
        custom_blurb: bizBlurb.trim() || null,
        og_title: bizOgPreview?.title ?? null,
        og_description: bizOgPreview?.description ?? null,
        og_image: bizOgPreview?.image ?? null,
        og_site_name: bizOgPreview?.siteName ?? null,
        is_approved: false,
        is_featured: false,
      }]);
      if (error) { alert(error.message); return; }
      setBizSubmitSuccess(true);
      setBizUrl(""); setBizName(""); setBizBlurb(""); setBizOgPreview(null);
      setTimeout(() => { setBizSubmitSuccess(false); setShowBizForm(false); }, 3000);
    } finally { setSubmittingBiz(false); }
  }

  function notify(recipientId: string, message: string, postOwnerId: string) {
    if (!userId || recipientId === userId || !currentUserName) return;
    supabase.from("notifications").insert([{
      user_id: recipientId,
      actor_id: userId,
      actor_name: currentUserName,
      type: "activity",
      message,
      post_owner_id: postOwnerId,
    }]);
  }

  async function toggleLike(postId: string, isCurrentlyLiked: boolean) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    try {
      setTogglingLikeFor(postId);

      if (isCurrentlyLiked) {
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", userId);

        if (error) {
          alert(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("post_likes").insert([
          {
            post_id: postId,
            user_id: userId,
          },
        ]);

        if (error) {
          alert(error.message);
          return;
        }

        const post = posts.find((p) => p.id === postId);
        if (post && post.user_id !== userId) {
          notify(post.user_id, `${currentUserName} liked your post`, post.user_id);
        }
      }

      await loadPosts();
    } finally {
      setTogglingLikeFor(null);
    }
  }

  async function toggleCommentLike(commentId: string, isCurrentlyLiked: boolean) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    try {
      setTogglingCommentLikeFor(commentId);

      if (isCurrentlyLiked) {
        const { error } = await supabase
          .from("post_comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", userId);

        if (error) {
          alert(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("post_comment_likes").insert([
          {
            comment_id: commentId,
            user_id: userId,
          },
        ]);

        if (error) {
          alert(error.message);
          return;
        }

        const comment = posts.flatMap((p) => p.comments).find((c) => c.id === commentId);
        if (comment && comment.user_id !== userId) {
          const ownerPost = posts.find((p) => p.id === comment.post_id);
          if (ownerPost) notify(comment.user_id, `${currentUserName} liked your comment`, ownerPost.user_id);
        }
      }

      await loadPosts();
    } finally {
      setTogglingCommentLikeFor(null);
    }
  }

  async function submitComment(postId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    const commentText = commentInputs[postId]?.trim() || "";
    const selectedCommentImage = selectedCommentImages[postId] || null;

    if (!commentText && !selectedCommentImage) return;

    try {
      setSubmittingCommentFor(postId);

      let imageUrl: string | null = null;

      if (selectedCommentImage) {
        imageUrl = await Promise.race<string>([
          uploadFileToFeedImagesBucket(
            selectedCommentImage.file,
            `${userId}/comments/${postId}`
          ),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("Comment image upload timed out.")),
              20000
            )
          ),
        ]);
      }

      let insertError: {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      } | null = null;

      const insertWithImage = await supabase.from("post_comments").insert([
        {
          post_id: postId,
          user_id: userId,
          content: commentText,
          image_url: imageUrl,
        },
      ]);

      insertError = insertWithImage.error;

      if (insertError && isMissingColumnError(insertError, "image_url")) {
        const fallbackInsert = await supabase.from("post_comments").insert([
          {
            post_id: postId,
            user_id: userId,
            content: commentText,
          },
        ]);

        insertError = fallbackInsert.error;

        if (!insertError && selectedCommentImage) {
          alert(
            "Your comment posted, but the database is not fully set up for comment images yet."
          );
        }
      }

      if (insertError) {
        console.error("Comment insert error:", insertError);
        alert(insertError.message || "Failed to post comment.");
        return;
      }

      setCommentInputs((prev) => ({
        ...prev,
        [postId]: "",
      }));

      clearSelectedCommentImage(postId);

      setExpandedComments((prev) => ({
        ...prev,
        [postId]: true,
      }));

      setSubmittingCommentFor(null);

      // Notifications
      const post = posts.find((p) => p.id === postId);
      if (post && currentUserName && userId) {
        if (post.user_id !== userId) {
          notify(post.user_id, `${currentUserName} commented on your post`, post.user_id);
        }
        supabase.from("post_comments").select("user_id").eq("post_id", postId).neq("user_id", userId).then(({ data: td }) => {
          const participants = [...new Set(((td ?? []) as { user_id: string }[]).map((c) => c.user_id))].filter((id) => id !== post.user_id);
          participants.forEach((pid) => notify(pid, `${currentUserName} also commented on a post you're following`, post.user_id));
        });
      }

      void loadPosts();
    } catch (err) {
      console.error("submitComment crashed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Something went wrong while posting your comment."
      );
      setSubmittingCommentFor(null);
    }
  }

  async function deletePost(postId: string) {
    if (!userId) return;
    if (!window.confirm("Delete this post?")) return;

    try {
      setDeletingPostId(postId);

      const { error } = await supabase.from("posts").delete().eq("id", postId);

      if (error) {
        alert(error.message);
        return;
      }

      await loadPosts();
    } finally {
      setDeletingPostId(null);
    }
  }

  async function deleteComment(commentId: string) {
    if (!userId) return;
    if (!window.confirm("Delete this comment?")) return;

    try {
      setDeletingCommentId(commentId);

      const { error } = await supabase
        .from("post_comments")
        .delete()
        .eq("id", commentId);

      if (error) {
        alert(error.message);
        return;
      }

      await loadPosts();
    } finally {
      setDeletingCommentId(null);
    }
  }

  function startEditPost(postId: string, currentContent: string) {
    setEditingPostId(postId);
    setEditingPostContent(currentContent);
  }

  function cancelEditPost() {
    setEditingPostId(null);
    setEditingPostContent("");
  }

  async function savePostEdit(postId: string) {
    if (!editingPostContent.trim()) return;

    try {
      setSavingPostId(postId);

      const { error } = await supabase
        .from("posts")
        .update({ content: editingPostContent.trim() })
        .eq("id", postId);

      if (error) {
        alert(error.message);
        return;
      }

      setEditingPostId(null);
      setEditingPostContent("");
      await loadPosts();
    } finally {
      setSavingPostId(null);
    }
  }

  function startEditComment(commentId: string, currentContent: string) {
    setEditingCommentId(commentId);
    setEditingCommentContent(currentContent);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingCommentContent("");
  }

  async function saveCommentEdit(commentId: string) {
    if (!editingCommentContent.trim()) return;

    try {
      setSavingCommentId(commentId);

      const { error } = await supabase
        .from("post_comments")
        .update({ content: editingCommentContent.trim() })
        .eq("id", commentId);

      if (error) {
        alert(error.message);
        return;
      }

      setEditingCommentId(null);
      setEditingCommentContent("");
      await loadPosts();
    } finally {
      setSavingCommentId(null);
    }
  }

  async function flagContent(contentType: "post" | "comment", contentId: string) {
    if (!userId) return;
    if (!window.confirm(`Flag this ${contentType} for admin review?`)) return;
    setFlaggingId(contentId);
    const { error } = await supabase.from("flags").insert([{ reporter_id: userId, content_type: contentType, content_id: contentId }]);
    if (error) { alert(error.message); } else { alert("Flagged for review. Thank you."); }
    setFlaggingId(null);
  }

  function toggleComments(postId: string) {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  }

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
          console.error("Auth load error:", error);
        }

        const currentUserId = data.user?.id ?? null;

        if (!isMounted) return;

        if (!currentUserId) {
          window.location.href = "/login";
          return;
        }

        // Check verification status — unverified users go to /pending
        const { data: profileCheck } = await supabase
          .from("profiles")
          .select("verification_status, first_name, last_name, service, company_name")
          .eq("user_id", currentUserId)
          .maybeSingle();

        // Sync Google OAuth name to profile if first_name is missing
        const googleName = data.user?.user_metadata?.full_name || data.user?.user_metadata?.name;
        if (profileCheck && !profileCheck.first_name && googleName) {
          const parts = (googleName as string).trim().split(/\s+/);
          const fn = parts[0] || "";
          const ln = parts.slice(1).join(" ") || "";
          await supabase.from("profiles").update({ first_name: fn, last_name: ln }).eq("user_id", currentUserId);
        }

        // If profile not yet set up, send to onboarding
        if (profileCheck && !profileCheck.service && !profileCheck.company_name) {
          window.location.href = "/onboarding";
          return;
        }

        if (!profileCheck || (profileCheck.verification_status !== "verified")) {
          window.location.href = "/pending";
          return;
        }

        setUserId(currentUserId);

        const nd = profileCheck as { first_name: string | null; last_name: string | null } | null;
        if (isMounted) setCurrentUserName(`${nd?.first_name || ""} ${nd?.last_name || ""}`.trim() || "Someone");

        await Promise.all([
          loadJobs().catch((err) => console.error("loadJobs failed:", err)),
          loadPosts(currentUserId).catch((err) => console.error("loadPosts failed:", err)),
          loadBusinessListings().catch((err) => console.error("loadBusinessListings failed:", err)),
          loadBizLikes(currentUserId).catch((err) => console.error("loadBizLikes failed:", err)),
          loadSavedJobs(currentUserId).catch((err) => console.error("loadSavedJobs failed:", err)),
          loadTodayMemorials().catch((err) => console.error("loadTodayMemorials failed:", err)),
        ]);
      } catch (error) {
        console.error("Homepage init error:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setUserId(nextUserId);
    });

    const channel = supabase
      .channel("feed-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => void loadPosts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_images" },
        () => void loadPosts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_comments" },
        () => void loadPosts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_likes" },
        () => void loadPosts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_comment_likes" },
        () => void loadPosts()
      )
      .subscribe();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(channel);

      selectedPostImagesRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });

      Object.values(selectedCommentImagesRef.current).forEach((item) => {
        if (item) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  const skeletonStyle: React.CSSProperties = {
    background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  function SkeletonBlock({ width = "100%", height = 14 }: { width?: string | number; height?: number }) {
    return <div style={{ ...skeletonStyle, width, height, marginBottom: 8 }} />;
  }

  function SkeletonCard() {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "white" }}>
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width="75%" height={11} />
        <SkeletonBlock width="40%" height={11} />
      </div>
    );
  }

  function SkeletonPost() {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "white" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ ...skeletonStyle, width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="35%" height={14} />
            <SkeletonBlock width="20%" height={11} />
          </div>
        </div>
        <SkeletonBlock width="100%" height={13} />
        <SkeletonBlock width="85%" height={13} />
        <SkeletonBlock width="60%" height={13} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1800,
        margin: "0 auto",
        padding: "24px 20px",
        boxSizing: "border-box",
      }}
    >
      <NavBar />

      {/* Mobile tab bar */}
      {isMobile && (
        <div style={{ display: "flex", gap: 0, marginTop: 12, borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
          {(["feed", "jobs", "businesses"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                background: mobileTab === tab ? "black" : "transparent",
                color: mobileTab === tab ? "white" : "#555",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "background 0.15s",
              }}
            >
              {tab === "feed" ? "EOD Hub" : tab === "jobs" ? "Jobs" : "Businesses"}
            </button>
          ))}
          <a
            href="/events"
            style={{
              flex: 1,
              padding: "10px 4px",
              border: "none",
              background: "transparent",
              color: "#555",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              textAlign: "center",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Events
          </a>
        </div>
      )}

      <div
        style={isMobile ? { marginTop: 12 } : {
          display: "grid",
          gridTemplateColumns: "280px minmax(0, 1fr) 360px",
          gap: 24,
          alignItems: "start",
          marginTop: 20,
          width: "100%",
        }}
      >
        {/* Jobs pane */}
        <aside
          style={{
            display: isMobile ? (mobileTab === "jobs" ? "block" : "none") : undefined,
            position: isMobile ? "static" : "sticky",
            top: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Link href="/post-job" style={{ background: "black", color: "white", borderRadius: 10, padding: "6px 14px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              Post Job
            </Link>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {!jobsLoaded && [0,1,2].map((i) => <SkeletonCard key={i} />)}
            {jobsLoaded && jobs.length === 0 && (
              <div style={{ fontSize: 14, color: "#666" }}>
                No approved jobs yet.
              </div>
            )}

            {jobsLoaded && jobs.map((job) => (
              <div
                key={job.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "white",
                }}
              >
                {job.og_image && (
                  <img
                    src={job.og_image}
                    alt={job.title || job.og_title || "Job preview"}
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                )}

                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 800, lineHeight: 1.3 }}>
                    {job.title || job.og_title || "Untitled Job"}
                  </div>

                  <div style={{ marginTop: 4, fontSize: 14, color: "#444" }}>
                    {job.company_name || job.og_site_name || "Unknown Company"}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
                    {job.location || "Location not listed"}
                  </div>

                  <div style={{ marginTop: 4, fontSize: 13, color: "#666" }}>
                    {job.category || "General"}
                    {job.created_at
                      ? ` • ${new Date(job.created_at).toLocaleDateString()}`
                      : ""}
                  </div>

                  {job.og_description && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: "#666",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {job.og_description}
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                    {job.apply_url && (
                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 14, fontWeight: 700 }}
                      >
                        View Job
                      </a>
                    )}

                    {userId && (
                      <button
                        type="button"
                        onClick={() => toggleSaveJob(job.id)}
                        disabled={togglingJobSaveFor === job.id}
                        style={{
                          background: savedJobIds.has(job.id) ? "black" : "white",
                          color: savedJobIds.has(job.id) ? "white" : "#555",
                          border: "1px solid #d1d5db",
                          borderRadius: 8,
                          padding: "5px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: togglingJobSaveFor === job.id ? "not-allowed" : "pointer",
                          opacity: togglingJobSaveFor === job.id ? 0.6 : 1,
                        }}
                      >
                        {togglingJobSaveFor === job.id ? "..." : savedJobIds.has(job.id) ? "Saved ✓" : "Save"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main style={{ display: isMobile ? (mobileTab === "feed" ? "block" : "none") : undefined, minWidth: 0 }}>
          <div
            style={{
              marginTop: 0,
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16,
              background: "white",
            }}
          >
            <textarea
              placeholder="What's happening in the EOD world?"
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              style={{
                width: "100%",
                minHeight: 90,
                border: "none",
                outline: "none",
                resize: "vertical",
                fontSize: 16,
                boxSizing: "border-box",
              }}
            />

            {fetchingOg && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Fetching link preview...</div>}
            {ogPreview && (
              <div style={{ position: "relative" }}>
                <OgCard og={ogPreview} />
                <button type="button" onClick={() => setOgPreview(null)} style={{ position: "absolute", top: 20, right: 8, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            )}

            <input
              ref={postImageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePostImageChange}
              style={{ display: "none" }}
            />

            {selectedPostImages.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
                {selectedPostImages.length} of 10 photos selected
              </div>
            )}

            {selectedPostImages.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 10,
                }}
              >
                {selectedPostImages.map((item, index) => (
                  <div
                    key={`${item.previewUrl}-${index}`}
                    style={{
                      position: "relative",
                      borderRadius: 12,
                      overflow: "hidden",
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      aspectRatio: "1 / 1",
                    }}
                  >
                    <img
                      src={item.previewUrl}
                      alt={`Selected post image ${index + 1}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => removeSelectedPostImage(index)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(0,0,0,0.75)",
                        color: "white",
                        border: "none",
                        borderRadius: 999,
                        width: 28,
                        height: 28,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                {selectedPostImages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelectedPostImages}
                    style={{
                      background: "transparent",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Remove All Photos
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={openPostImagePicker}
                  style={{
                    background: "white",
                    color: "black",
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {selectedPostImages.length > 0 ? "Add More Photos" : "Add Photo"}
                </button>

                <button
                  onClick={submitPost}
                  disabled={submittingPost}
                  style={{
                    background: "black",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: submittingPost ? "not-allowed" : "pointer",
                    opacity: submittingPost ? 0.7 : 1,
                  }}
                >
                  {submittingPost ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            {!postsLoaded && [0,1,2,3].map((i) => <SkeletonPost key={i} />)}
            {/* Memorial anniversary cards — auto-injected on anniversary date */}
            {todayMemorials.map((m) => (
              <div key={`memorial-${m.id}`} style={{ border: "2px solid #7c3aed", borderRadius: 14, padding: 20, background: "#faf5ff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
                  ✦ We Remember · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  {m.photo_url && (
                    <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "3px solid #7c3aed" }}>
                      <img src={m.photo_url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>{m.name}</div>
                    <div style={{ fontSize: 13, color: "#7c3aed", marginTop: 2 }}>
                      {new Date(m.death_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      {" · "}
                      {new Date().getFullYear() - parseInt(m.death_date.split("-")[0])} years ago
                    </div>
                    {m.bio && <div style={{ marginTop: 10, lineHeight: 1.6, color: "#444" }}>{m.bio}</div>}
                  </div>
                </div>
              </div>
            ))}

            {posts.map((post) => {
              const commentsOpen = expandedComments[post.id] || false;
              const isOwnPost = userId === post.user_id;
              const isEditingPost = editingPostId === post.id;
              const selectedCommentImage = selectedCommentImages[post.id] || null;

              return (
                <div
                  key={post.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 16,
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <Link
                        href={`/profile/${post.user_id}`}
                        style={{ textDecoration: "none" }}
                      >
                        <Avatar
                          photoUrl={post.authorPhotoUrl}
                          name={post.authorName}
                          size={46}
                          service={post.authorService}
                        />
                      </Link>

                      <div>
                        <Link
                          href={`/profile/${post.user_id}`}
                          style={{
                            fontWeight: 800,
                            color: "black",
                            textDecoration: "none",
                          }}
                        >
                          {post.authorName}
                        </Link>

                        <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>
                          {formatDate(post.created_at)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {isOwnPost && !isEditingPost && (
                        <button type="button" onClick={() => startEditPost(post.id, post.content)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#777", fontWeight: 700 }}>
                          Edit
                        </button>
                      )}
                      {isOwnPost && (
                        <button type="button" onClick={() => deletePost(post.id)} disabled={deletingPostId === post.id} style={{ background: "transparent", border: "none", padding: 0, cursor: deletingPostId === post.id ? "not-allowed" : "pointer", color: "#777", fontWeight: 700, opacity: deletingPostId === post.id ? 0.6 : 1 }}>
                          {deletingPostId === post.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                      {!isOwnPost && (
                        <button type="button" onClick={() => flagContent("post", post.id)} disabled={flaggingId === post.id} title="Flag for review" style={{ background: "transparent", border: "none", padding: "0 2px", cursor: flaggingId === post.id ? "not-allowed" : "pointer", color: "#ccc", fontSize: 15, lineHeight: 1 }}>
                          ⚑
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditingPost ? (
                    <div style={{ marginTop: 10 }}>
                      <textarea
                        value={editingPostContent}
                        onChange={(e) => setEditingPostContent(e.target.value)}
                        style={{
                          width: "100%",
                          minHeight: 90,
                          border: "1px solid #d1d5db",
                          borderRadius: 10,
                          padding: 10,
                          resize: "vertical",
                          fontSize: 15,
                          boxSizing: "border-box",
                        }}
                      />

                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 10,
                        }}
                      >
                        <button
                          type="button"
                          onClick={cancelEditPost}
                          style={{
                            background: "transparent",
                            border: "1px solid #d1d5db",
                            borderRadius: 10,
                            padding: "8px 14px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={() => savePostEdit(post.id)}
                          disabled={savingPostId === post.id}
                          style={{
                            background: "black",
                            color: "white",
                            border: "none",
                            borderRadius: 10,
                            padding: "8px 14px",
                            fontWeight: 700,
                            cursor: savingPostId === post.id ? "not-allowed" : "pointer",
                            opacity: savingPostId === post.id ? 0.7 : 1,
                          }}
                        >
                          {savingPostId === post.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.content && (
                        <div style={{ marginTop: 10, lineHeight: 1.5 }}>{renderContent(post.content)}</div>
                      )}

                      {post.og_url && (post.og_title || post.og_image) && (
                        <OgCard og={{ url: post.og_url, title: post.og_title, description: post.og_description, image: post.og_image, siteName: post.og_site_name }} />
                      )}

                      {post.image_urls.length > 0 &&
                        (() => {
                          const visibleImages = post.image_urls.slice(0, 3);
                          const remainingCount = post.image_urls.length - 3;

                          return (
                            <div
                              style={{
                                marginTop: 12,
                                display: "grid",
                                gridTemplateColumns:
                                  visibleImages.length === 1
                                    ? "1fr"
                                    : visibleImages.length === 2
                                    ? "repeat(2, minmax(0, 1fr))"
                                    : "repeat(3, minmax(0, 1fr))",
                                gap: 8,
                                maxWidth: 420,
                              }}
                            >
                              {visibleImages.map((url, index) => {
                                const showOverlay = index === 2 && remainingCount > 0;

                                return (
                                  <button
                                    key={`${url}-${index}`}
                                    type="button"
                                    onClick={() => openGallery(post.image_urls, index)}
                                    style={{
                                      position: "relative",
                                      borderRadius: 12,
                                      overflow: "hidden",
                                      border: "1px solid #e5e7eb",
                                      background: "#f9fafb",
                                      aspectRatio: "1 / 1",
                                      padding: 0,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <img
                                      src={url}
                                      alt={`Post image ${index + 1}`}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "block",
                                        objectFit: "cover",
                                      }}
                                    />

                                    {showOverlay && (
                                      <div
                                        style={{
                                          position: "absolute",
                                          inset: 0,
                                          background: "rgba(0, 0, 0, 0.45)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "white",
                                          fontSize: 24,
                                          fontWeight: 800,
                                        }}
                                      >
                                        +{remainingCount}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                    </>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      alignItems: "center",
                      marginTop: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleLike(post.id, post.likedByCurrentUser)}
                      disabled={togglingLikeFor === post.id}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: togglingLikeFor === post.id ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        color: post.likedByCurrentUser ? "black" : "#666",
                        opacity: togglingLikeFor === post.id ? 0.6 : 1,
                      }}
                    >
                      {post.likedByCurrentUser ? "Unlike" : "Like"}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleComments(post.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#666",
                      }}
                    >
                      {commentsOpen ? "Hide Comments" : "Comment"}
                    </button>

                    <div style={{ fontSize: 14, color: "#777" }}>
                      {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
                    </div>

                    <div style={{ fontSize: 14, color: "#777" }}>
                      {post.commentCount}{" "}
                      {post.commentCount === 1 ? "comment" : "comments"}
                    </div>
                  </div>

                  {commentsOpen && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ display: "grid", gap: 12 }}>
                        {post.comments.map((comment) => {
                          const isOwnComment = userId === comment.user_id;
                          const isEditingComment = editingCommentId === comment.id;

                          return (
                            <div
                              key={comment.id}
                              style={{
                                background: "#f9fafb",
                                borderRadius: 10,
                                padding: 12,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  alignItems: "flex-start",
                                }}
                              >
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                  <Link
                                    href={`/profile/${comment.user_id}`}
                                    style={{ textDecoration: "none" }}
                                  >
                                    <Avatar
                                      photoUrl={comment.authorPhotoUrl}
                                      name={comment.authorName}
                                      size={34}
                                      service={comment.authorService}
                                    />
                                  </Link>

                                  <div>
                                    <Link
                                      href={`/profile/${comment.user_id}`}
                                      style={{
                                        fontWeight: 700,
                                        fontSize: 14,
                                        color: "black",
                                        textDecoration: "none",
                                      }}
                                    >
                                      {comment.authorName}
                                    </Link>

                                    <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
                                      {formatDate(comment.created_at)}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                  {!isOwnComment && (
                                    <button type="button" onClick={() => flagContent("comment", comment.id)} disabled={flaggingId === comment.id} title="Flag for review" style={{ background: "transparent", border: "none", padding: "0 2px", cursor: flaggingId === comment.id ? "not-allowed" : "pointer", color: "#ccc", fontSize: 13, lineHeight: 1 }}>
                                      ⚑
                                    </button>
                                  )}
                                  {isOwnComment && (
                                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    {!isEditingComment && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          startEditComment(comment.id, comment.content)
                                        }
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          padding: 0,
                                          cursor: "pointer",
                                          color: "#777",
                                          fontWeight: 700,
                                        }}
                                      >
                                        Edit
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => deleteComment(comment.id)}
                                      disabled={deletingCommentId === comment.id}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        padding: 0,
                                        cursor:
                                          deletingCommentId === comment.id
                                            ? "not-allowed"
                                            : "pointer",
                                        color: "#777",
                                        fontWeight: 700,
                                        opacity: deletingCommentId === comment.id ? 0.6 : 1,
                                      }}
                                    >
                                      {deletingCommentId === comment.id
                                        ? "Deleting..."
                                        : "Delete"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                              {isEditingComment ? (
                                <div style={{ marginTop: 8 }}>
                                  <textarea
                                    value={editingCommentContent}
                                    onChange={(e) => setEditingCommentContent(e.target.value)}
                                    style={{
                                      width: "100%",
                                      minHeight: 70,
                                      border: "1px solid #d1d5db",
                                      borderRadius: 10,
                                      padding: 10,
                                      resize: "vertical",
                                      fontSize: 14,
                                      boxSizing: "border-box",
                                    }}
                                  />

                                  <div
                                    style={{
                                      marginTop: 10,
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: 10,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={cancelEditComment}
                                      style={{
                                        background: "transparent",
                                        border: "1px solid #d1d5db",
                                        borderRadius: 10,
                                        padding: "8px 14px",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Cancel
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => saveCommentEdit(comment.id)}
                                      disabled={savingCommentId === comment.id}
                                      style={{
                                        background: "black",
                                        color: "white",
                                        border: "none",
                                        borderRadius: 10,
                                        padding: "8px 14px",
                                        fontWeight: 700,
                                        cursor:
                                          savingCommentId === comment.id
                                            ? "not-allowed"
                                            : "pointer",
                                        opacity: savingCommentId === comment.id ? 0.7 : 1,
                                      }}
                                    >
                                      {savingCommentId === comment.id ? "Saving..." : "Save"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {comment.content && (
                                    <div style={{ marginTop: 8, lineHeight: 1.5 }}>
                                      {comment.content}
                                    </div>
                                  )}

                                  {comment.image_url && (
                                    <div
                                      style={{
                                        marginTop: 10,
                                        maxWidth: 180,
                                        borderRadius: 10,
                                        overflow: "hidden",
                                        border: "1px solid #e5e7eb",
                                      }}
                                    >
                                      <img
                                        src={comment.image_url}
                                        alt="Comment image"
                                        style={{
                                          width: "100%",
                                          height: 180,
                                          display: "block",
                                          objectFit: "cover",
                                        }}
                                      />
                                    </div>
                                  )}
                                </>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  gap: 14,
                                  alignItems: "center",
                                  marginTop: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleCommentLike(comment.id, comment.likedByCurrentUser)
                                  }
                                  disabled={togglingCommentLikeFor === comment.id}
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    cursor:
                                      togglingCommentLikeFor === comment.id
                                        ? "not-allowed"
                                        : "pointer",
                                    fontWeight: 700,
                                    color: comment.likedByCurrentUser ? "black" : "#666",
                                    opacity:
                                      togglingCommentLikeFor === comment.id ? 0.6 : 1,
                                  }}
                                >
                                  {comment.likedByCurrentUser ? "Unlike" : "Like"}
                                </button>

                                <div style={{ fontSize: 13, color: "#777" }}>
                                  {comment.likeCount}{" "}
                                  {comment.likeCount === 1 ? "like" : "likes"}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {post.comments.length === 0 && (
                          <div style={{ color: "#777", fontSize: 14 }}>
                            No comments yet.
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <textarea
                          placeholder="Write a comment..."
                          value={commentInputs[post.id] || ""}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [post.id]: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            minHeight: 70,
                            border: "1px solid #d1d5db",
                            borderRadius: 10,
                            padding: 10,
                            resize: "vertical",
                            fontSize: 14,
                            boxSizing: "border-box",
                          }}
                        />

                        <input
                          ref={(el) => {
                            commentImageInputRefs.current[post.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleCommentImageChange(post.id, e)}
                          style={{ display: "none" }}
                        />

                        {selectedCommentImage && (
                          <div style={{ marginTop: 10 }}>
                            <div
                              style={{
                                position: "relative",
                                width: 120,
                                maxWidth: "100%",
                                borderRadius: 10,
                                overflow: "hidden",
                                border: "1px solid #e5e7eb",
                              }}
                            >
                              <img
                                src={selectedCommentImage.previewUrl}
                                alt="Selected comment image"
                                style={{
                                  width: "100%",
                                  height: 120,
                                  display: "block",
                                  objectFit: "cover",
                                }}
                              />

                              <button
                                type="button"
                                onClick={() => clearSelectedCommentImage(post.id)}
                                style={{
                                  position: "absolute",
                                  top: 6,
                                  right: 6,
                                  background: "rgba(0,0,0,0.75)",
                                  color: "white",
                                  border: "none",
                                  borderRadius: 999,
                                  width: 24,
                                  height: 24,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => openCommentImagePicker(post.id)}
                            style={{
                              background: "white",
                              color: "black",
                              border: "1px solid #d1d5db",
                              borderRadius: 10,
                              padding: "8px 12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {selectedCommentImage ? "Change Photo" : "Add Photo"}
                          </button>

                          <button
                            type="button"
                            onClick={() => submitComment(post.id)}
                            disabled={submittingCommentFor === post.id}
                            style={{
                              background: "black",
                              color: "white",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 14px",
                              fontWeight: 700,
                              cursor:
                                submittingCommentFor === post.id
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: submittingCommentFor === post.id ? 0.7 : 1,
                            }}
                          >
                            {submittingCommentFor === post.id
                              ? "Posting..."
                              : "Add Comment"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        <aside
          style={{
            display: isMobile ? (mobileTab === "businesses" ? "block" : "none") : undefined,
            position: isMobile ? "static" : "sticky",
            top: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => { setShowBizForm((p) => !p); setBizSubmitSuccess(false); }}
              style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              {showBizForm ? "Cancel" : "Submit Biz/Org"}
            </button>
          </div>

          {/* Submission form */}
          {showBizForm && (
            <div style={{ marginTop: 14, border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fafafa" }}>
              {bizSubmitSuccess ? (
                <div style={{ textAlign: "center", padding: "16px 0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
                  ✓ Submitted! Our team will review and approve your listing.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Website URL *</label>
                    <input
                      type="url"
                      value={bizUrl}
                      onChange={(e) => handleBizUrlChange(e.target.value)}
                      placeholder="https://yourbusiness.com"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" }}
                    />
                    {fetchingBizOg && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Fetching preview...</div>}
                    {bizOgPreview && <OgCard og={bizOgPreview} />}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Business / Org Name *</label>
                    <input
                      type="text"
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      placeholder="Branded Apparel Company"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Description</label>
                    <textarea
                      value={bizBlurb}
                      onChange={(e) => setBizBlurb(e.target.value)}
                      placeholder="Brief description of your business or org..."
                      rows={3}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>

                  <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
                    Submissions are reviewed by our team before going live.
                  </div>

                  <button
                    type="button"
                    onClick={submitBizListing}
                    disabled={submittingBiz || !bizUrl.trim() || !bizName.trim()}
                    style={{ width: "100%", background: "black", color: "white", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: submittingBiz || !bizUrl.trim() || !bizName.trim() ? "not-allowed" : "pointer", opacity: submittingBiz || !bizUrl.trim() || !bizName.trim() ? 0.5 : 1 }}
                  >
                    {submittingBiz ? "Submitting..." : "Submit for Review"}
                  </button>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {!bizLoaded && [0,1,2].map((i) => <SkeletonCard key={i} />)}
            {bizLoaded && businessListings.length === 0 && (
              <div style={{ fontSize: 14, color: "#666" }}>
                No approved businesses yet.
              </div>
            )}

            {bizLoaded && businessListings.map((listing) => {
              const displayTitle =
                listing.og_title ||
                listing.business_name ||
                listing.og_site_name ||
                "Business Listing";

              const displayDescription =
                listing.custom_blurb || listing.og_description || "Visit website";

              const isLiked = likedBizIds.has(listing.id);
              return (
                <div
                  key={listing.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "white",
                  }}
                >
                  <a
                    href={listing.website_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    {listing.og_image ? (
                      <img
                        src={listing.og_image}
                        alt={displayTitle}
                        style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                      />
                    ) : null}

                    <div style={{ padding: 14, paddingBottom: 10 }}>
                      <div style={{ fontWeight: 800, lineHeight: 1.3, fontSize: 18 }}>
                        {displayTitle}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 14, color: "#666", lineHeight: 1.5 }}>
                        {displayDescription}
                      </div>
                    </div>
                  </a>

                  <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {listing.is_featured ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#111", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>
                        Featured
                      </span>
                    ) : <span />}
                    <button
                      onClick={(e) => handleBizLike(e, listing.id)}
                      disabled={togglingBizLikeFor === listing.id || !userId}
                      style={{ background: "none", border: "none", cursor: userId ? "pointer" : "default", display: "flex", alignItems: "center", gap: 5, padding: "4px 0", opacity: togglingBizLikeFor === listing.id ? 0.5 : 1 }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? "black" : "none"} stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{listing.like_count ?? 0}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {isGalleryOpen && galleryImages.length > 0 && (
        <div
          onClick={closeGallery}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.86)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 980,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <button
              type="button"
              onClick={closeGallery}
              style={{
                position: "absolute",
                top: -10,
                right: 0,
                background: "rgba(255,255,255,0.14)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 999,
                width: 42,
                height: 42,
                fontSize: 24,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            {galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={showPrevGalleryImage}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "rgba(255,255,255,0.14)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.25)",
                    borderRadius: 999,
                    width: 46,
                    height: 46,
                    fontSize: 28,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={showNextGalleryImage}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "rgba(255,255,255,0.14)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.25)",
                    borderRadius: 999,
                    width: 46,
                    height: 46,
                    fontSize: 28,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ›
                </button>
              </>
            )}

            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <img
                src={galleryImages[galleryIndex]}
                alt={`Gallery image ${galleryIndex + 1}`}
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                  objectFit: "contain",
                  borderRadius: 12,
                  display: "block",
                }}
              />
            </div>

            <div
              style={{
                color: "white",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {galleryIndex + 1} / {galleryImages.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}