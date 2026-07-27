"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CIRCUIT_THOUGHT_MAX_LEN,
  CIRCUIT_TITLE_MAX_LEN,
  canAccessCollapsingCircuit,
  thoughtFontSizePx,
  type CircuitPostDto,
  type CircuitPromptDto,
  type CircuitStripItem,
} from "../../lib/circuit";
import { uploadCircuitMedia } from "../../lib/circuitUpload";
import { muxPosterUrl, parseMuxFeedVideoUrl } from "../../lib/feedVideoUrl";
import { useSuppressChatroomPeek } from "../../hooks/useSuppressChatroomPeek";
import { getAccessToken, supabase } from "../../lib/lib/supabaseClient";
import { openFeedMediaPicker } from "../../lib/native/pickFeedMedia";
import {
  adminPostDisplayName,
  canUsePostAsSelector,
  loadStoredPostAsMode,
  POST_AS_ADMIN_EMAIL,
  resolvePostAsModeFromPost,
  storePostAsMode,
  type PostAsMode,
} from "../../lib/postAsIdentity";
import PostAsSelector from "../PostAsSelector";
import CollapsingCircuitViewer from "./CollapsingCircuitViewer";

type Props = {
  currentUserId: string | null;
  currentUserEmail?: string | null;
};

type ComposerMode = "media" | "thought";

type PendingMedia = {
  localUrl: string;
  file: File;
};

export default function CollapsingCircuitStrip({ currentUserId, currentUserEmail = null }: Props) {
  const enabled = canAccessCollapsingCircuit(currentUserEmail);
  const deepLinkHandled = useRef<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<CircuitStripItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("media");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<CircuitPromptDto | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [postAsMode, setPostAsMode] = useState<PostAsMode>(() => loadStoredPostAsMode());
  const [canChoosePostAs, setCanChoosePostAs] = useState(false);
  const [selfLabel, setSelfLabel] = useState("You");
  const [selfPhotoUrl, setSelfPhotoUrl] = useState<string | null>(null);
  const [adminLabel, setAdminLabel] = useState("EOD HUB Admin");
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  useSuppressChatroomPeek(composerOpen, "circuit-composer");

  const posts = useMemo(
    () => items.filter((i): i is { kind: "post"; post: CircuitPostDto } => i.kind === "post").map((i) => i.post),
    [items],
  );

  const load = useCallback(async () => {
    if (!enabled || !currentUserId) return;
    const token = await getAccessToken({ source: "CollapsingCircuit.load" });
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/circuit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        items?: CircuitStripItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not load Collapsing Circuit.");
        return;
      }
      setItems(body.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || items.length === 0) return;
    const circuitId = new URLSearchParams(window.location.search).get("circuit");
    if (!circuitId) return;
    if (deepLinkHandled.current === circuitId) return;
    const postIdx = items
      .filter((i): i is { kind: "post"; post: CircuitPostDto } => i.kind === "post")
      .findIndex((i) => i.post.id === circuitId);
    if (postIdx < 0) return;
    deepLinkHandled.current = circuitId;
    setViewerIndex(postIdx);
  }, [items]);

  useEffect(() => {
    return () => {
      for (const m of pendingMedia) URL.revokeObjectURL(m.localUrl);
    };
  }, [pendingMedia]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    async function loadPostAsOptions() {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!authUser || cancelled) return;

      const viewerEmail = authUser.email?.trim().toLowerCase() ?? null;
      if (!canUsePostAsSelector(viewerEmail)) {
        if (!cancelled) {
          setCanChoosePostAs(false);
          setAdminUserId(null);
        }
        return;
      }

      const [{ data: viewerProfile }, { data: adminProfile }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, first_name, last_name, photo_url")
          .eq("user_id", authUser.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name, photo_url")
          .ilike("email", POST_AS_ADMIN_EMAIL)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setCanChoosePostAs(Boolean(adminProfile?.user_id));
      setAdminUserId(adminProfile?.user_id ?? null);
      if (viewerProfile) {
        setSelfLabel(adminPostDisplayName(viewerProfile) || "You");
        setSelfPhotoUrl(viewerProfile.photo_url ?? null);
      }
      if (adminProfile) {
        setAdminLabel(adminPostDisplayName(adminProfile));
        setAdminPhotoUrl(adminProfile.photo_url ?? null);
      }
    }

    void loadPostAsOptions();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  if (!enabled || !currentUserId) return null;

  const openComposer = (mode: ComposerMode, p: CircuitPromptDto | null = null) => {
    setEditingPostId(null);
    setComposerMode(mode);
    setPrompt(p);
    setTitleDraft(mode === "thought" ? "" : (p?.label ?? ""));
    setDraft("");
    setPendingMedia([]);
    setComposerError(null);
    setPostAsMode(loadStoredPostAsMode());
    setComposerOpen(true);
  };

  const openEditComposer = (post: CircuitPostDto) => {
    if (post.post_type === "event") return;
    setViewerIndex(null);
    setEditingPostId(post.id);
    setComposerMode(post.post_type === "thought" ? "thought" : "media");
    setPrompt(null);
    setTitleDraft(post.post_type === "thought" ? "" : (post.title ?? ""));
    setDraft(post.body ?? "");
    setPendingMedia([]);
    setComposerError(null);
    setPostAsMode(resolvePostAsModeFromPost(post.post_as_user_id, adminUserId));
    setComposerOpen(true);
  };

  const onPickFiles = (files: FileList | File[] | null) => {
    if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) return;
    const list = Array.isArray(files) ? files : Array.from(files);
    const next: PendingMedia[] = [];
    for (const file of list) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      if (pendingMedia.length + next.length >= 10) break;
      next.push({ file, localUrl: URL.createObjectURL(file) });
    }
    if (next.length > 0) setPendingMedia((prev) => [...prev, ...next]);
  };

  const openMediaPicker = () => {
    void openFeedMediaPicker({
      mediaInputRef,
      onFiles: (files) => onPickFiles(files),
      remainingSlots: Math.max(0, 10 - pendingMedia.length),
    });
  };

  const submit = async () => {
    const token = await getAccessToken({ source: "CollapsingCircuit.submit" });
    if (!token || !currentUserId) return;
    setSubmitting(true);
    setComposerError(null);
    try {
      if (editingPostId) {
        const isThought = composerMode === "thought";
        const thoughtText = draft.trim();
        if (isThought && !thoughtText) {
          setComposerError("Thought cannot be empty.");
          return;
        }
        const res = await fetch(`/api/circuit/${editingPostId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isThought
              ? {
                  title: null,
                  body: thoughtText,
                  ...(canChoosePostAs ? { postAsMode } : {}),
                }
              : {
                  title: titleDraft.trim() || null,
                  body: draft.trim() || null,
                  ...(canChoosePostAs ? { postAsMode } : {}),
                },
          ),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setComposerError(body.error || "Could not save edits.");
          return;
        }
        setComposerOpen(false);
        setEditingPostId(null);
        setTitleDraft("");
        setDraft("");
        await load();
        return;
      }

      let mediaPayload: {
        media_type: "image" | "video";
        public_url: string;
        storage_path: string | null;
        poster_url: string | null;
      }[] = [];

      if (composerMode === "media") {
        if (pendingMedia.length < 1) {
          setComposerError("Add at least one photo or video.");
          return;
        }
        for (const item of pendingMedia) {
          mediaPayload.push(await uploadCircuitMedia(supabase, item.file, currentUserId));
        }
      } else if (!draft.trim()) {
        setComposerError("Thought cannot be empty.");
        return;
      }

      const isThought = composerMode === "thought";
      const res = await fetch("/api/circuit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_type: composerMode,
          title: isThought ? null : (titleDraft.trim() || null),
          body: draft.trim() || null,
          prompt_id: prompt?.id ?? null,
          media: mediaPayload,
          ...(canChoosePostAs ? { postAsMode } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setComposerError(body.error || "Could not post.");
        return;
      }
      for (const m of pendingMedia) URL.revokeObjectURL(m.localUrl);
      setComposerOpen(false);
      setPendingMedia([]);
      setTitleDraft("");
      setDraft("");
      await load();
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : "Could not post.");
    } finally {
      setSubmitting(false);
    }
  };

  const viewerPosts = posts;
  const activeViewerPost =
    viewerIndex != null && viewerIndex >= 0 && viewerIndex < viewerPosts.length
      ? viewerPosts[viewerIndex]!
      : null;

  return (
    <section className="circuit-strip" aria-label="Collapsing Circuit">
      <div className="circuit-strip-header">
        <div className="circuit-strip-heading">
          <div className="circuit-strip-title">Collapsing Circuit</div>
          <div className="circuit-strip-sub">24h tiles</div>
        </div>
      </div>

      {error ? <div className="circuit-strip-error">{error}</div> : null}

      <div className="circuit-strip-scroller">
        {loading && items.length === 0 ? (
          <div className="circuit-tile circuit-tile-prompt">
            <span>Loading…</span>
          </div>
        ) : null}

        {items.map((item, idx) => {
          if (item.kind === "blank") {
            return (
              <button
                key={`blank-${idx}`}
                type="button"
                className="circuit-tile circuit-tile-blank"
                aria-label="Post to Collapsing Circuit"
                onClick={() => openComposer("media", null)}
              >
                <span className="circuit-tile-plus" aria-hidden="true">
                  +
                </span>
              </button>
            );
          }

          if (item.kind === "prompt") {
            const thoughtish = item.prompt.slug === "random-thought";
            return (
              <button
                key={`prompt-${item.prompt.id}-${idx}`}
                type="button"
                className="circuit-tile circuit-tile-prompt"
                onClick={() => openComposer(thoughtish ? "thought" : "media", item.prompt)}
              >
                <span className="circuit-tile-plus" aria-hidden="true">
                  +
                </span>
                <span className="circuit-tile-prompt-label">{item.prompt.label}</span>
                <span className="circuit-tile-prompt-cta">tap to post</span>
              </button>
            );
          }

          const post = item.post;
          const postIdx = viewerPosts.findIndex((p) => p.id === post.id);
          return (
            <button
              key={post.id}
              type="button"
              className={`circuit-tile circuit-tile-post${post.seen ? "" : " circuit-tile-unseen"}`}
              onClick={() => setViewerIndex(postIdx >= 0 ? postIdx : 0)}
            >
              {post.post_type === "thought" ? (
                <div className="circuit-tile-thought">
                  <span
                    style={{
                      fontSize: Math.max(11, Math.round(thoughtFontSizePx(post.body || "", 18, 11) * 0.55)),
                    }}
                  >
                    {(post.body || "").slice(0, 72)}
                    {(post.body || "").length > 72 ? "…" : ""}
                  </span>
                </div>
              ) : post.post_type === "event" ? (
                <div className="circuit-tile-event">
                  {post.event?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.event.image_url} alt="" />
                  ) : (
                    <div className="circuit-tile-event-fallback" />
                  )}
                  <span className="circuit-tile-event-badge">event</span>
                </div>
              ) : (
                <CircuitThumb post={post} />
              )}
              {post.author_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.author_photo_url}
                  alt=""
                  className="circuit-tile-avatar-tl"
                />
              ) : (
                <span className="circuit-tile-avatar-tl circuit-tile-avatar-fallback">
                  {post.author_name.slice(0, 1).toUpperCase()}
                </span>
              )}
              {post.post_type !== "thought" && (post.title || post.event?.title) ? (
                <span className="circuit-tile-post-title">
                  {post.title || post.event?.title}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeViewerPost && viewerIndex != null ? (
        <CollapsingCircuitViewer
          posts={viewerPosts}
          index={viewerIndex}
          currentUserId={currentUserId}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDeleted={async () => {
            setViewerIndex(null);
            await load();
          }}
          onEdit={(post) => openEditComposer(post)}
          onFlagged={async () => {
            setViewerIndex(null);
            await load();
          }}
          onSeen={(postId) => {
            setItems((prev) =>
              prev.map((item) =>
                item.kind === "post" && item.post.id === postId
                  ? { ...item, post: { ...item.post, seen: true } }
                  : item,
              ),
            );
          }}
        />
      ) : null}

      {composerOpen ? (
        <div className="circuit-composer-backdrop" role="dialog" aria-modal="true" aria-label="Circuit composer">
          <div className="circuit-composer">
            <div className="circuit-composer-top">
              <strong>{editingPostId ? "Edit Circuit post" : "Collapsing Circuit"}</strong>
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setEditingPostId(null);
                }}
                disabled={submitting}
              >
                Close
              </button>
            </div>
            <p className="circuit-composer-guidelines">
              No injury, death, or similar content. Keep it appropriate for the community.
            </p>
            {canChoosePostAs ? (
              <PostAsSelector
                mode={postAsMode}
                onChange={(mode) => {
                  setPostAsMode(mode);
                  storePostAsMode(mode);
                }}
                selfLabel={selfLabel}
                selfPhotoUrl={selfPhotoUrl}
                adminLabel={adminLabel}
                adminPhotoUrl={adminPhotoUrl}
                disabled={submitting}
              />
            ) : null}
            {prompt ? <div className="circuit-composer-prompt">Prompt: {prompt.label}</div> : null}
            {!editingPostId ? (
              <div className="circuit-composer-modes">
                <button
                  type="button"
                  className={composerMode === "media" ? "active" : ""}
                  onClick={() => setComposerMode("media")}
                >
                  Photos / video
                </button>
                <button
                  type="button"
                  className={composerMode === "thought" ? "active" : ""}
                  onClick={() => setComposerMode("thought")}
                >
                  Thought
                </button>
              </div>
            ) : null}

            {composerMode === "media" ? (
              <>
                <input
                  className="circuit-composer-title"
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value.slice(0, CIRCUIT_TITLE_MAX_LEN))}
                  placeholder="Title (shows on the tile)"
                  maxLength={CIRCUIT_TITLE_MAX_LEN}
                />
                <div className="circuit-composer-count">
                  {titleDraft.length}/{CIRCUIT_TITLE_MAX_LEN}
                </div>
                {!editingPostId ? (
                  <>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        onPickFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="circuit-composer-file"
                      onClick={openMediaPicker}
                    >
                      Add photos or videos
                    </button>
                  </>
                ) : (
                  <div className="circuit-composer-prompt">Media stays the same — you can edit title and caption.</div>
                )}
                {pendingMedia.length > 0 ? (
                  <div className="circuit-composer-previews">
                    {pendingMedia.map((m, i) => (
                      <div key={m.localUrl} className="circuit-composer-preview">
                        {m.file.type.startsWith("video/") ? (
                          <video src={m.localUrl} muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.localUrl} alt="" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(m.localUrl);
                            setPendingMedia((prev) => prev.filter((_, j) => j !== i));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, CIRCUIT_THOUGHT_MAX_LEN))}
                  placeholder="Caption (optional) — links welcome"
                  rows={2}
                />
                <div className="circuit-composer-count">
                  {draft.length}/{CIRCUIT_THOUGHT_MAX_LEN}
                </div>
              </>
            ) : (
              <>
                <textarea
                  className="circuit-composer-title"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, CIRCUIT_THOUGHT_MAX_LEN))}
                  placeholder="Your thought…"
                  rows={5}
                  maxLength={CIRCUIT_THOUGHT_MAX_LEN}
                  style={{ fontSize: thoughtFontSizePx(draft || " ", 28, 16) }}
                />
                <div className="circuit-composer-count">
                  {draft.length}/{CIRCUIT_THOUGHT_MAX_LEN}
                </div>
              </>
            )}

            {composerError ? <div className="circuit-strip-error">{composerError}</div> : null}
            <button
              type="button"
              className="circuit-composer-submit"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting
                ? editingPostId
                  ? "Saving…"
                  : "Posting…"
                : editingPostId
                  ? "Save changes"
                  : "Drop into the Circuit"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CircuitThumb({ post }: { post: CircuitPostDto }) {
  const first = post.media[0];
  if (!first) {
    return <div className="circuit-tile-media circuit-tile-media-empty" />;
  }
  if (first.media_type === "video") {
    const mux = parseMuxFeedVideoUrl(first.public_url);
    const poster =
      first.poster_url || (mux?.playbackId ? muxPosterUrl(mux.playbackId) : null);
    return (
      <div className="circuit-tile-media">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" />
        ) : (
          <video src={first.public_url} muted playsInline preload="metadata" />
        )}
        <span className="circuit-tile-play">▶</span>
        {post.media.length > 1 ? <span className="circuit-tile-multi">{post.media.length}</span> : null}
      </div>
    );
  }
  return (
    <div className="circuit-tile-media">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={first.public_url} alt="" />
      {post.media.length > 1 ? <span className="circuit-tile-multi">{post.media.length}</span> : null}
    </div>
  );
}
