"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type Post = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  score?: number;
  ranking_score?: number;
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
};

type ProfileName = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
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
  likeCount: number;
  likedByCurrentUser: boolean;
};

type FeedPost = Post & {
  authorName: string;
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
  comments: FeedComment[];
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function formatJobDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [businessListings, setBusinessListings] = useState<BusinessListing[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [submittingPost, setSubmittingPost] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingCommentFor, setSubmittingCommentFor] = useState<string | null>(null);

  const [togglingLikeFor, setTogglingLikeFor] = useState<string | null>(null);
  const [togglingCommentLikeFor, setTogglingCommentLikeFor] = useState<string | null>(null);

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  async function loadBusinessListings() {
  const { data, error } = await supabase
    .from("business_listings")
    .select("*")
    .eq("is_approved", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("Business listings load error:", error);
    return;
  }

  setBusinessListings((data ?? []) as BusinessListing[]);
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
}

  async function loadPosts(currentUserId?: string | null) {
    const effectiveUserId = currentUserId ?? userId;

    const { data: postsData, error: postsError } = await supabase
  .from("ranked_posts")
  .select("id, user_id, content, created_at, score, ranking_score");

    if (postsError) {
      console.error("Feed load error:", postsError);
      return;
    }

    const rawPosts = (postsData ?? []) as Post[];

    if (rawPosts.length === 0) {
      setPosts([]);
      return;
    }

    const postIds = rawPosts.map((post) => post.id);
    const uniqueUserIds = [...new Set(rawPosts.map((post) => post.user_id))];

    const { data: likesData, error: likesError } = await supabase
      .from("post_likes")
      .select("post_id, user_id")
      .in("post_id", postIds);

    if (likesError) {
      console.error("Likes load error:", likesError);
    }

    const { data: commentsData, error: commentsError } = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (commentsError) {
      console.error("Comments load error:", commentsError);
    }

    const rawComments = (commentsData ?? []) as Comment[];
    const commentIds = rawComments.map((comment) => comment.id);

    const { data: commentLikesData, error: commentLikesError } = commentIds.length
      ? await supabase
          .from("post_comment_likes")
          .select("comment_id, user_id")
          .in("comment_id", commentIds)
      : { data: [], error: null };

    if (commentLikesError) {
      console.error("Comment likes load error:", commentLikesError);
    }

    const allProfileUserIds = [
      ...new Set([
        ...uniqueUserIds,
        ...rawComments.map((comment) => comment.user_id),
      ]),
    ];

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", allProfileUserIds);

    if (profileError) {
      console.error("Profile name load error:", profileError);
    }

    const profileMap = new Map<string, string>();

    (profileData as ProfileName[] | null)?.forEach((profile) => {
      const fullName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User";
      profileMap.set(profile.user_id, fullName);
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
        authorName: profileMap.get(comment.user_id) || "User",
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

      return {
        ...post,
        authorName: profileMap.get(post.user_id) || "User",
        likeCount: likesForPost.length,
        commentCount: commentsForPost.length,
        likedByCurrentUser: effectiveUserId
          ? likesForPost.includes(effectiveUserId)
          : false,
        comments: commentsForPost,
      };
    });

    setPosts(mergedPosts);
  }

  async function submitPost() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    if (!content.trim()) return;

    try {
      setSubmittingPost(true);

      const { error } = await supabase.from("posts").insert([
        {
          user_id: userId,
          content: content.trim(),
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      setContent("");
      await loadPosts();
    } finally {
      setSubmittingPost(false);
    }
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
    if (!commentText) return;

    try {
      setSubmittingCommentFor(postId);

      const { error } = await supabase.from("post_comments").insert([
        {
          post_id: postId,
          user_id: userId,
          content: commentText,
        },
      ]);

      if (error) {
        alert(error.message);
        return;
      }

      setCommentInputs((prev) => ({
        ...prev,
        [postId]: "",
      }));

      setExpandedComments((prev) => ({
        ...prev,
        [postId]: true,
      }));

      await loadPosts();
    } finally {
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

  function toggleComments(postId: string) {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  }

  useEffect(() => {
  async function init() {
    const { data } = await supabase.auth.getUser();
    const currentUserId = data.user?.id ?? null;
    setUserId(currentUserId);

    await Promise.all([
  loadJobs(),
  loadPosts(currentUserId),
  loadBusinessListings(),
]);
    setLoading(false);
  }

  init();

  const channel = supabase
    .channel("feed-updates")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadPosts()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "post_comments" },
      () => loadPosts()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "post_likes" },
      () => loadPosts()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        <NavBar />
        <div style={{ marginTop: 20 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <NavBar />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px minmax(0, 1fr) 280px",
          gap: 20,
          alignItems: "start",
          marginTop: 20,
        }}
      >
        <aside
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            position: "sticky",
            top: 20,
            background: "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Jobs</h2>
            <Link href="/post-job" style={{ fontSize: 14, fontWeight: 700 }}>
              Post
            </Link>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {jobs.length === 0 && (
  <div style={{ fontSize: 14, color: "#666" }}>No approved jobs yet.</div>
)}

{jobs.map((job) => (
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

      {job.apply_url && (
        <a
          href={job.apply_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: 10,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          View Job
        </a>
      )}
    </div>
  </div>
))}
          </div>
        </aside>

        <main>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>EOD Feed</h1>

          <div
            style={{
              marginTop: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 16,
              background: "white",
            }}
          >
            <textarea
              placeholder="What's happening in the EOD world?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: "100%",
                minHeight: 90,
                border: "none",
                outline: "none",
                resize: "vertical",
                fontSize: 16,
              }}
            />

            <div style={{ marginTop: 10, textAlign: "right" }}>
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

          <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
            {posts.map((post) => {
              const commentsOpen = expandedComments[post.id] || false;
              const isOwnPost = userId === post.user_id;
              const isEditingPost = editingPostId === post.id;

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

                    {isOwnPost && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        {!isEditingPost && (
                          <button
                            type="button"
                            onClick={() => startEditPost(post.id, post.content)}
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
                          onClick={() => deletePost(post.id)}
                          disabled={deletingPostId === post.id}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: deletingPostId === post.id ? "not-allowed" : "pointer",
                            color: "#777",
                            fontWeight: 700,
                            opacity: deletingPostId === post.id ? 0.6 : 1,
                          }}
                        >
                          {deletingPostId === post.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    )}
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
                    <div style={{ marginTop: 10, lineHeight: 1.5 }}>{post.content}</div>
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
                      {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
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
                                <div style={{ marginTop: 8, lineHeight: 1.5 }}>
                                  {comment.content}
                                </div>
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
                          }}
                        />

                        <div style={{ marginTop: 10, textAlign: "right" }}>
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
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    position: "sticky",
    top: 20,
    background: "white",
  }}
>
  <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
    EOD Businesses
  </h2>

  <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
    {businessListings.length === 0 && (
      <div style={{ fontSize: 14, color: "#666" }}>
        No approved businesses yet.
      </div>
    )}

    {businessListings.map((listing) => {
      const displayTitle =
        listing.og_title || listing.business_name || listing.og_site_name || "Business Listing";

      const displayDescription =
        listing.custom_blurb || listing.og_description || "Visit website";

      return (
        <a
          key={listing.id}
          href={listing.website_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            textDecoration: "none",
            color: "inherit",
            background: "white",
          }}
        >
          {listing.og_image ? (
            <img
              src={listing.og_image}
              alt={displayTitle}
              style={{
                width: "100%",
                height: 140,
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: 140,
                background: "#f3f4f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "#666",
                fontWeight: 700,
              }}
            >
              No Preview Image
            </div>
          )}

          <div style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, lineHeight: 1.3 }}>
              {displayTitle}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 14,
                color: "#666",
                lineHeight: 1.4,
              }}
            >
              {displayDescription}
            </div>

            {listing.is_featured && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#111",
                }}
              >
                Featured
              </div>
            )}
          </div>
        </a>
      );
    })}
  </div>
</aside>
      </div>
    </div>
  );
}