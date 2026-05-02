"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";
import GifPickerButton from "../../components/GifPickerButton";
import EmojiPickerButton from "../../components/EmojiPickerButton";
import { ReactionLeaderboard, ReactionPickerTrigger } from "../../components/ReactionBar";
import { applyContentReaction, type ReactionType } from "../../lib/reactions";
import { fetchIsolatedFeedPost, fetchIsolatedUnitPost } from "../lib/dataClient";
import type { IsolatedComment, IsolatedPost as IsolatedPostData } from "../lib/types";

// ── Mention + URL rendering (mirrors the main feed) ──────────────────────────

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
const URL_RE = /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/g;

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const combined = new RegExp(`(${MENTION_RE.source})|${URL_RE.source}`, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[0].startsWith("@[")) {
      const name = match[2];
      const uid = match[3];
      parts.push(
        <Link
          key={`m-${match.index}`}
          href={`/profile/${uid}`}
          style={{ color: "#3b82f6", fontWeight: 600, textDecoration: "none" }}
        >
          @{name}
        </Link>
      );
    } else {
      const raw = match[0].replace(/[.,)>]+$/, "");
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      parts.push(
        <a
          key={`u-${match.index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {raw}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
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

type Props = {
  sourceType: "feed" | "unit";
  sourcePostId: string;
  viewerUserId: string | null;
  curatorNote?: string | null;
};

export default function IsolatedPost({ sourceType, sourcePostId, viewerUserId, curatorNote }: Props) {
  const { t, isDark } = useTheme();
  const theme = isDark ? "dark" : "light";

  const [post, setPost] = useState<IsolatedPostData | null>(null);
  const [comments, setComments] = useState<IsolatedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [viewerLiked, setViewerLiked] = useState(false);
  const [togglingLike, setTogglingLike] = useState(false);
  const [showComments, setShowComments] = useState(true);

  // Comment compose state
  const [commentText, setCommentText] = useState("");
  const [commentGif, setCommentGif] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const result =
        sourceType === "feed"
          ? await fetchIsolatedFeedPost(supabase, sourcePostId, viewerUserId)
          : await fetchIsolatedUnitPost(supabase, sourcePostId, viewerUserId);
      if (!mounted) return;
      setPost(result.post);
      setComments(result.comments);
      if (result.post) {
        setLikeCount(result.post.likeCount);
        setViewerLiked(sourceType === "unit" ? (result.post.viewerLiked ?? false) : false);
      }
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [sourceType, sourcePostId, viewerUserId]);

  async function handleFeedReactionPick(picked: ReactionType) {
    if (!viewerUserId || togglingLike || sourceType !== "feed") return;
    setTogglingLike(true);
    try {
      await applyContentReaction(supabase, {
        subjectKind: "post",
        subjectId: sourcePostId,
        userId: viewerUserId,
        picked,
      });
      const refreshed = await fetchIsolatedFeedPost(supabase, sourcePostId, viewerUserId);
      setPost(refreshed.post);
      setComments(refreshed.comments);
      if (refreshed.post) {
        setLikeCount(refreshed.post.likeCount);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingLike(false);
    }
  }

  async function toggleUnitLike() {
    if (!viewerUserId || togglingLike || sourceType !== "unit") return;
    setTogglingLike(true);
    const table = "unit_post_likes";
    const col = "unit_post_id";
    if (viewerLiked) {
      await supabase.from(table).delete().eq(col, sourcePostId).eq("user_id", viewerUserId);
      setLikeCount((c) => Math.max(0, c - 1));
      setViewerLiked(false);
    } else {
      await supabase.from(table).insert({ [col]: sourcePostId, user_id: viewerUserId });
      setLikeCount((c) => c + 1);
      setViewerLiked(true);
    }
    setTogglingLike(false);
  }

  async function submitComment() {
    const body = commentText.trim();
    if ((!body && !commentGif) || !viewerUserId || postingComment) return;
    setPostingComment(true);

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("first_name, last_name, display_name, photo_url")
      .eq("user_id", viewerUserId)
      .maybeSingle();
    const authorName =
      (profileRow as any)?.display_name ||
      `${(profileRow as any)?.first_name ?? ""} ${(profileRow as any)?.last_name ?? ""}`.trim() ||
      "Me";

    const row = sourceType === "feed"
      ? { post_id: sourcePostId, user_id: viewerUserId, content: body, gif_url: commentGif ?? null }
      : { unit_post_id: sourcePostId, user_id: viewerUserId, content: body, gif_url: commentGif ?? null };

    const table = sourceType === "feed" ? "post_comments" : "unit_post_comments";
    const { data: inserted } = await supabase
      .from(table)
      .insert(row)
      .select("id, created_at")
      .maybeSingle();

    if (inserted) {
      setComments((prev) => [
        ...prev,
        {
          id: inserted.id,
          content: body,
          createdAt: inserted.created_at,
          authorName,
          authorPhoto: (profileRow as any)?.photo_url ?? null,
          gifUrl: commentGif ?? null,
        },
      ]);
    }

    setCommentText("");
    setCommentGif(null);
    setPostingComment(false);
  }

  if (loading) {
    return <div style={{ padding: 20, color: "#94a3b8", fontSize: 14 }}>Loading post...</div>;
  }

  if (!post) {
    return (
      <div
        style={{
          padding: 16,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          color: "#94a3b8",
          fontSize: 14,
        }}
      >
        Original post unavailable.
      </div>
    );
  }

  const inputBg = isDark ? "#0f172a" : "#fff";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Unit badge */}
      {post.sourceType === "unit" && post.unitName && (
        <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700 }}>
          <span style={{ opacity: 0.7 }}>From group: </span>
          {post.unitSlug ? (
            <a href={`/units/${post.unitSlug}`} style={{ color: "#7c3aed", textDecoration: "underline" }}>
              {post.unitName}
            </a>
          ) : (
            post.unitName
          )}
        </div>
      )}

      {/* Curator's Note */}
      {curatorNote && (
        <div
          style={{
            padding: "10px 14px",
            background: isDark ? "rgba(250,204,21,0.07)" : "rgba(250,204,21,0.12)",
            border: "1px solid rgba(250,204,21,0.25)",
            borderRadius: 10,
            fontSize: 13,
            color: isDark ? "#fde68a" : "#92400e",
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, marginRight: 6 }}>Curator&apos;s Note:</span>
          {curatorNote}
        </div>
      )}

      {/* Post card */}
      <div
        style={{
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          background: t.surface,
          overflow: "hidden",
        }}
      >
        {/* Author row */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px 12px" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              background: "#1e293b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
              color: "#94a3b8",
              border: `1px solid ${t.border}`,
            }}
          >
            {post.author.photoUrl ? (
              <img
                src={post.author.photoUrl}
                alt={post.author.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              (post.author.name[0] || "?").toUpperCase()
            )}
          </div>
          <div>
            <Link href={`/profile/${post.author.id}`} style={{ fontWeight: 800, fontSize: 14, color: t.text, textDecoration: "none" }}>
              {post.author.name}
            </Link>
            <div style={{ fontSize: 12, color: t.textMuted ?? "#94a3b8" }}>{timeAgo(post.createdAt)}</div>
          </div>
        </div>

        {/* Post content */}
        <div style={{ padding: "0 16px" }}>
          {post.content && (
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: t.text,
                whiteSpace: "pre-wrap",
                marginBottom: 12,
              }}
            >
              {renderContent(post.content)}
            </div>
          )}

          {post.imageUrl && (
            <div
              style={{
                marginBottom: 12,
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${t.border}`,
                maxWidth: 500,
              }}
            >
              <img src={post.imageUrl} alt="" style={{ width: "100%", display: "block" }} />
            </div>
          )}

          {post.gifUrl && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={post.gifUrl}
                alt="GIF"
                style={{ maxWidth: 400, borderRadius: 12, display: "block" }}
              />
            </div>
          )}

          {/* OG Card */}
          {post.ogUrl && (post.ogTitle || post.ogImageUrl) && (
            <a
              href={post.ogUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                marginBottom: 12,
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                overflow: "hidden",
                textDecoration: "none",
                color: t.text,
                maxWidth: 500,
              }}
            >
              {post.ogImageUrl && (
                <img
                  src={post.ogImageUrl}
                  alt=""
                  style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
                />
              )}
              <div style={{ padding: "10px 14px" }}>
                {post.ogTitle && (
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{post.ogTitle}</div>
                )}
                {post.ogDescription && (
                  <div style={{ fontSize: 12, color: t.textMuted ?? "#94a3b8", lineHeight: 1.4 }}>
                    {post.ogDescription.length > 140
                      ? `${post.ogDescription.slice(0, 140)}…`
                      : post.ogDescription}
                  </div>
                )}
              </div>
            </a>
          )}
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 16px",
            borderTop: `1px solid ${t.border}`,
            flexWrap: "wrap",
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          {post.sourceType === "feed" ? (
            <>
              <ReactionPickerTrigger
                t={t}
                disabled={!viewerUserId}
                viewerReaction={post.myReaction ?? null}
                totalCount={likeCount}
                busy={togglingLike}
                showTriggerCount={false}
                onPick={(type) => void handleFeedReactionPick(type)}
              />
              <button
                type="button"
                onClick={() => setShowComments((v) => !v)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 14,
                  color: t.textMuted ?? "#94a3b8",
                }}
              >
                {showComments ? "Hide comments" : "Comment"}
              </button>
              <div style={{ flex: "1 1 24px", minWidth: 0 }} />
              <ReactionLeaderboard
                t={t}
                countsByType={post.reactionCountsByType ?? {}}
                reactorNamesByType={post.reactorNamesByType ?? {}}
              />
              <span style={{ fontSize: 13, color: t.textMuted ?? "#94a3b8" }}>
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleUnitLike}
                disabled={!viewerUserId || togglingLike}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: viewerUserId ? "pointer" : "default",
                  fontWeight: 700,
                  fontSize: 14,
                  color: viewerLiked ? t.text : (t.textMuted ?? "#94a3b8"),
                }}
              >
                {viewerLiked ? "Unlike" : "Like"}
              </button>
              <button
                type="button"
                onClick={() => setShowComments((v) => !v)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 14,
                  color: t.textMuted ?? "#94a3b8",
                }}
              >
                {showComments ? "Hide comments" : "Comment"}
              </button>
              <span style={{ fontSize: 13, color: t.textMuted ?? "#94a3b8" }}>
                {likeCount} {likeCount === 1 ? "like" : "likes"}
              </span>
              <span style={{ fontSize: 13, color: t.textMuted ?? "#94a3b8" }}>
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </span>
            </>
          )}
        </div>

        {/* Comments section */}
        {showComments && (
          <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${t.border}` }}>
            {/* Existing comments */}
            {comments.length === 0 && (
              <div style={{ color: t.textMuted ?? "#94a3b8", fontSize: 13, paddingTop: 12 }}>
                No comments yet.
              </div>
            )}
            {comments.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10, paddingTop: 10 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#94a3b8",
                    border: `1px solid ${t.border}`,
                  }}
                >
                  {c.authorPhoto ? (
                    <img
                      src={c.authorPhoto}
                      alt={c.authorName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    (c.authorName[0] || "?").toUpperCase()
                  )}
                </div>
                <div
                  style={{
                    background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    flex: 1,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 3, color: t.text }}>
                    {c.authorName}
                  </div>
                  {c.content && (
                    <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                      {renderContent(c.content)}
                    </div>
                  )}
                  {c.gifUrl && (
                    <div style={{ marginTop: 8 }}>
                      <img
                        src={c.gifUrl}
                        alt="GIF"
                        style={{ maxWidth: 220, borderRadius: 8, display: "block" }}
                      />
                    </div>
                  )}
                  {c.imageUrl && (
                    <div
                      style={{
                        marginTop: 8,
                        maxWidth: 220,
                        borderRadius: 8,
                        overflow: "hidden",
                        border: `1px solid ${t.border}`,
                      }}
                    >
                      <img
                        src={c.imageUrl}
                        alt=""
                        style={{ width: "100%", display: "block", objectFit: "cover" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Comment compose — full toolbar matching the feed */}
            {viewerUserId && (
              <div style={{ marginTop: 14 }}>
                {/* GIF preview */}
                {commentGif && (
                  <div style={{ position: "relative", marginBottom: 8, width: "fit-content" }}>
                    <img
                      src={commentGif}
                      alt="Selected GIF"
                      style={{ maxWidth: 200, borderRadius: 8, display: "block" }}
                    />
                    <button
                      type="button"
                      onClick={() => setCommentGif(null)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: "rgba(0,0,0,0.6)",
                        border: "none",
                        borderRadius: "50%",
                        width: 22,
                        height: 22,
                        color: "#fff",
                        fontSize: 14,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}

                <textarea
                  ref={commentRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitComment();
                    }
                  }}
                  rows={2}
                  placeholder="Add a comment..."
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: inputBg,
                    color: t.text,
                    fontSize: 13,
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                    marginBottom: 8,
                  }}
                />

                {/* Toolbar row: GIF · Emoji · Send */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <GifPickerButton
                    onSelect={(url) => {
                      setCommentGif(url);
                    }}
                    theme={theme}
                  />

                  <EmojiPickerButton
                    value={commentText}
                    onChange={setCommentText}
                    inputRef={commentRef}
                    theme={theme}
                  />

                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={postingComment || (!commentText.trim() && !commentGif)}
                    style={{
                      marginLeft: "auto",
                      background:
                        postingComment || (!commentText.trim() && !commentGif) ? "#475569" : "#facc15",
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 18px",
                      color:
                        postingComment || (!commentText.trim() && !commentGif) ? "#e2e8f0" : "#0f172a",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor:
                        postingComment || (!commentText.trim() && !commentGif) ? "default" : "pointer",
                    }}
                  >
                    {postingComment ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
