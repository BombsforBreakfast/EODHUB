"use client";

import MuxPlayer from "@mux/mux-player-react/lazy";
import { MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { useSuppressChatroomPeek } from "../../hooks/useSuppressChatroomPeek";
import { thoughtFontSizePx, type CircuitPostDto } from "../../lib/circuit";
import { muxPosterUrl, parseMuxFeedVideoUrl, type FeedVideoStatus } from "../../lib/feedVideoUrl";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../../lib/flagCategories";
import { linkifyPlainText } from "../../lib/linkifyPlainText";
import { getAccessToken } from "../../lib/lib/supabaseClient";
import EventFeedActions from "../EventFeedActions";
import CircuitEngagePanel from "./CircuitEngagePanel";

type Props = {
  posts: CircuitPostDto[];
  index: number;
  currentUserId: string;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
  onEdit?: (post: CircuitPostDto) => void;
  onFlagged?: () => void | Promise<void>;
  onSeen?: (postId: string) => void;
};

const IMAGE_DWELL_MS = 5200;
const THOUGHT_DWELL_MS = 6500;
const EVENT_DWELL_MS = 7000;
const LONG_PRESS_MS = 200;
const SHEET_DISMISS_DY = 80;
const DESKTOP_MQ = "(min-width: 900px)";

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_MQ).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export default function CollapsingCircuitViewer({
  posts,
  index,
  currentUserId,
  onIndexChange,
  onClose,
  onDeleted,
  onEdit,
  onFlagged,
  onSeen,
}: Props) {
  const post = posts[index] ?? null;
  const isDesktop = useIsDesktop();
  useSuppressChatroomPeek(Boolean(post), "circuit-viewer");
  const [mediaIndex, setMediaIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engageOpen, setEngageOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muxPlaybackId, setMuxPlaybackId] = useState<string | null>(null);
  const [muxStatus, setMuxStatus] = useState<FeedVideoStatus | null>(null);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const progressRaf = useRef<number | null>(null);
  const advanceRef = useRef<() => void>(() => {});
  const progressElapsedRef = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTouchStartY = useRef<number | null>(null);
  const isDesktopRef = useRef(isDesktop);
  isDesktopRef.current = isDesktop;

  const media = post?.media ?? [];
  const mediaCount = media.length;
  const activeMedia = media[mediaIndex] ?? null;
  const muxRef = activeMedia ? parseMuxFeedVideoUrl(activeMedia.public_url) : null;
  const effectivePlaybackId = muxPlaybackId || muxRef?.playbackId || null;
  const videoProcessing = Boolean(
    activeMedia?.media_type === "video" && muxRef && !effectivePlaybackId,
  );
  const pauseAdvance = paused || reportOpen || videoProcessing || engageOpen;

  const goPeer = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= posts.length) return;
      onIndexChange(next);
    },
    [index, onIndexChange, posts.length],
  );

  const goMedia = useCallback(
    (delta: number) => {
      if (!post || post.post_type !== "media" || mediaCount <= 1) return false;
      const next = mediaIndex + delta;
      if (next < 0 || next >= mediaCount) return false;
      setMediaIndex(next);
      return true;
    },
    [mediaCount, mediaIndex, post],
  );

  const goPrev = useCallback(() => {
    if (post?.post_type === "media" && mediaIndex > 0) {
      goMedia(-1);
      return;
    }
    goPeer(-1);
  }, [goMedia, goPeer, mediaIndex, post?.post_type]);

  const advance = useCallback(() => {
    if (post?.post_type === "media" && mediaCount > 1 && mediaIndex < mediaCount - 1) {
      setMediaIndex((m) => m + 1);
      return;
    }
    if (index < posts.length - 1) onIndexChange(index + 1);
    else onClose();
  }, [index, mediaCount, mediaIndex, onClose, onIndexChange, post?.post_type, posts.length]);

  advanceRef.current = advance;

  useEffect(() => {
    setMediaIndex(0);
    setError(null);
    setEngageOpen(isDesktopRef.current);
    setReportOpen(false);
    setProgress(0);
    progressElapsedRef.current = 0;
    setMuxPlaybackId(null);
    setMuxStatus(null);
  }, [post?.id]);

  useEffect(() => {
    setProgress(0);
    progressElapsedRef.current = 0;
  }, [mediaIndex]);

  useEffect(() => {
    setMuxPlaybackId(muxRef?.playbackId ?? null);
    setMuxStatus(muxRef?.status ?? null);
  }, [activeMedia?.id, muxRef?.playbackId, muxRef?.status]);

  useEffect(() => {
    if (!muxRef?.id || effectivePlaybackId || muxStatus === "ready") return;
    if (
      muxStatus === "upload_failed" ||
      muxStatus === "asset_error" ||
      muxStatus === "cancelled" ||
      muxStatus === "timed_out"
    ) {
      return;
    }
    let cancelled = false;
    const check = async () => {
      const token = await getAccessToken({ source: "CollapsingCircuit.mux" });
      if (!token || cancelled) return;
      const res = await fetch(`/api/feed/video-uploads/${encodeURIComponent(muxRef.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { status?: FeedVideoStatus; playbackId?: string | null };
      if (body.status) setMuxStatus(body.status);
      if (body.playbackId) setMuxPlaybackId(body.playbackId);
    };
    void check();
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [effectivePlaybackId, muxRef?.id, muxStatus]);

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    (async () => {
      const token = await getAccessToken({ source: "CollapsingCircuit.view" });
      if (!token || cancelled) return;
      await fetch(`/api/circuit/${post.id}/view`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      onSeen?.(post.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [onSeen, post?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typingInField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (engageOpen) {
          setEngageOpen(false);
          return;
        }
        if (!typingInField) onClose();
        return;
      }

      if (typingInField) return;

      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowDown") goMedia(1);
      if (e.key === "ArrowUp") goMedia(-1);
      if (e.key === " ") {
        e.preventDefault();
        setPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, engageOpen, goMedia, goPrev, onClose]);

  useEffect(() => {
    if (!post || pauseAdvance) {
      if (progressRaf.current != null) {
        cancelAnimationFrame(progressRaf.current);
        progressRaf.current = null;
      }
      return;
    }
    // Videos advance on ended (Mux / native).
    if (post.post_type === "media" && activeMedia?.media_type === "video") {
      setProgress(0);
      progressElapsedRef.current = 0;
      return;
    }

    const dwell =
      post.post_type === "thought"
        ? THOUGHT_DWELL_MS
        : post.post_type === "event"
          ? EVENT_DWELL_MS
          : IMAGE_DWELL_MS;

    const startedAt = performance.now() - progressElapsedRef.current;
    let lastPct = progressElapsedRef.current / dwell;

    const tick = (now: number) => {
      const elapsed = Math.min(dwell, now - startedAt);
      progressElapsedRef.current = elapsed;
      const pct = elapsed / dwell;
      // Avoid re-render spam for tiny floats; ~30fps is enough for the bar.
      if (pct - lastPct >= 0.02 || pct >= 1) {
        lastPct = pct;
        setProgress(pct);
      }
      if (pct >= 1) {
        progressElapsedRef.current = 0;
        advanceRef.current();
        return;
      }
      progressRaf.current = requestAnimationFrame(tick);
    };
    progressRaf.current = requestAnimationFrame(tick);
    return () => {
      if (progressRaf.current != null) {
        cancelAnimationFrame(progressRaf.current);
        progressRaf.current = null;
      }
    };
  }, [activeMedia?.media_type, mediaIndex, pauseAdvance, post?.id, post?.post_type]);

  useEffect(() => {
    if (!engageOpen) {
      setSheetDragY(0);
      setSheetDragging(false);
      sheetTouchStartY.current = null;
    }
  }, [engageOpen]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current != null) clearTimeout(longPressTimer.current);
    };
  }, []);

  if (!post) return null;

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPressPause = () => {
    if (engageOpen) return;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      setPaused(true);
    }, LONG_PRESS_MS);
  };

  const endLongPressPause = () => {
    clearLongPress();
    setPaused(false);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (engageOpen) return;
    const t = e.changedTouches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
    startLongPressPause();
  };

  const onTouchMove = (e: TouchEvent) => {
    if (engageOpen) return;
    const start = touchStart.current;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    // Cancel pending pause once the finger clearly moves (swipe / tap flick).
    if (Math.abs(t.clientX - start.x) > 12 || Math.abs(t.clientY - start.y) > 12) {
      clearLongPress();
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    endLongPressPause();
    if (engageOpen) return;
    const start = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) advance();
      else goPrev();
    }
  };

  const onSheetGrabStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.changedTouches[0];
    if (!t) return;
    sheetTouchStartY.current = t.clientY;
    setSheetDragging(true);
  };

  const onSheetGrabMove = (e: TouchEvent<HTMLDivElement>) => {
    if (sheetTouchStartY.current == null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dy = Math.max(0, t.clientY - sheetTouchStartY.current);
    setSheetDragY(dy);
  };

  const onSheetGrabEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (sheetTouchStartY.current == null) return;
    const t = e.changedTouches[0];
    const dy = t ? Math.max(0, t.clientY - sheetTouchStartY.current) : sheetDragY;
    sheetTouchStartY.current = null;
    setSheetDragging(false);
    if (dy >= SHEET_DISMISS_DY) {
      setSheetDragY(0);
      setEngageOpen(false);
      return;
    }
    setSheetDragY(0);
  };

  const onSheetGrabCancel = () => {
    sheetTouchStartY.current = null;
    setSheetDragging(false);
    setSheetDragY(0);
  };

  const deleteOwn = async () => {
    const token = await getAccessToken({ source: "CollapsingCircuit.delete" });
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/circuit/${post.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Could not delete.");
        return;
      }
      await onDeleted();
    } finally {
      setBusy(false);
    }
  };

  const report = async (category: FlagCategory) => {
    const token = await getAccessToken({ source: "CollapsingCircuit.report" });
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/circuit/${post.id}/report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Could not report.");
        return;
      }
      setReportOpen(false);
      await onFlagged?.();
      if (!onFlagged) advance();
    } finally {
      setBusy(false);
    }
  };

  const segmentCount =
    post.post_type === "media" && mediaCount > 0 ? mediaCount : 1;
  const activeSegment = post.post_type === "media" ? mediaIndex : 0;
  const isOwner = post.user_id === currentUserId;
  const isEvent = post.post_type === "event" && Boolean(post.event_id);
  const showEngageRail = isDesktop && engageOpen;
  const showEngageSheet = !isDesktop && engageOpen;

  const engagePanel = isEvent ? (
    post.event_id ? (
      <div className="circuit-event-actions">
        <EventFeedActions
          eventId={post.event_id}
          signupUrl={post.event?.signup_url ?? null}
          initialInterested={post.event_interested_count}
          initialGoing={post.event_going_count}
          initialMyAttendance={post.event_my_attendance}
          initialSaved={post.event_saved}
          userId={currentUserId}
        />
      </div>
    ) : null
  ) : (
    <CircuitEngagePanel postId={post.id} currentUserId={currentUserId} />
  );

  return (
    <div className="circuit-viewer" role="dialog" aria-modal="true" aria-label="Collapsing Circuit viewer">
      <div className="circuit-progress-bars" aria-hidden="true">
        {Array.from({ length: segmentCount }, (_, i) => (
          <div key={i} className="circuit-progress-seg">
            <div
              className="circuit-progress-fill"
              style={{
                width:
                  i < activeSegment
                    ? "100%"
                    : i === activeSegment
                      ? `${Math.round(progress * 100)}%`
                      : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="circuit-viewer-chrome">
        <div className="circuit-viewer-author">
          {post.author_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author_photo_url} alt="" />
          ) : null}
          <div>
            <div className="circuit-viewer-name">{post.author_name}</div>
            {post.title && post.post_type !== "thought" ? (
              <div className="circuit-viewer-prompt">{post.title}</div>
            ) : post.prompt_label && post.post_type !== "thought" ? (
              <div className="circuit-viewer-prompt">{post.prompt_label}</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="circuit-viewer-close"
          aria-label="Close"
        >
          <X size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="circuit-viewer-body">
        <div
          className="circuit-viewer-stage"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={endLongPressPause}
          onMouseDown={() => startLongPressPause()}
          onMouseUp={endLongPressPause}
          onMouseLeave={endLongPressPause}
        >
          <button
            type="button"
            className="circuit-viewer-nav circuit-viewer-nav-prev"
            aria-label="Previous"
            onClick={goPrev}
          />
          <button
            type="button"
            className="circuit-viewer-nav circuit-viewer-nav-next"
            aria-label="Next"
            onClick={() => advance()}
          />

          {post.post_type === "thought" ? (
            <div className="circuit-thought-card">
              <p style={{ fontSize: thoughtFontSizePx(post.body || "", 48, 20) }}>
                {linkifyPlainText(post.body || "")}
              </p>
            </div>
          ) : post.post_type === "event" && post.event ? (
            <div className="circuit-viewer-event">
              {post.event.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.event.image_url} alt="" />
              ) : (
                <div className="circuit-viewer-event-fallback" />
              )}
              <div className="circuit-viewer-event-copy">
                <div className="circuit-viewer-event-kicker">Event</div>
                <div className="circuit-viewer-event-chips">
                  <span className="circuit-event-chip">{post.event.date}</span>
                  {post.event.event_time ? (
                    <span className="circuit-event-chip">{post.event.event_time}</span>
                  ) : null}
                  <span className="circuit-event-chip">
                    {post.event_going_count} going · {post.event_interested_count} interested
                  </span>
                </div>
                <h2>{post.event.title}</h2>
                {post.body ? (
                  <p className="circuit-viewer-event-caption">{linkifyPlainText(post.body)}</p>
                ) : null}
                {post.event.location ? (
                  <p className="circuit-viewer-event-meta">{post.event.location}</p>
                ) : null}
                {post.event.description ? (
                  <p className="circuit-viewer-event-desc">{post.event.description}</p>
                ) : null}
              </div>
            </div>
          ) : activeMedia ? (
            <div className="circuit-viewer-media">
              {activeMedia.media_type === "video" ? (
                effectivePlaybackId ? (
                  <MuxPlayer
                    key={`${activeMedia.id}-${effectivePlaybackId}`}
                    playbackId={effectivePlaybackId}
                    streamType="on-demand"
                    autoPlay
                    muted
                    playsInline
                    poster={activeMedia.poster_url || muxPosterUrl(effectivePlaybackId)}
                    style={{ width: "100%", height: "100%" }}
                    onEnded={() => advance()}
                  />
                ) : muxRef ? (
                  <div className="circuit-thought-card">
                    <p>
                      {muxStatus === "upload_failed" ||
                      muxStatus === "asset_error" ||
                      muxStatus === "cancelled" ||
                      muxStatus === "timed_out"
                        ? "Video unavailable"
                        : "Processing video…"}
                    </p>
                  </div>
                ) : (
                  <video
                    key={activeMedia.id}
                    src={activeMedia.public_url}
                    controls
                    playsInline
                    autoPlay
                    muted
                    onEnded={() => advance()}
                  />
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={activeMedia.id} src={activeMedia.public_url} alt="" />
              )}
              {post.body ? (
                <div className="circuit-viewer-caption">{linkifyPlainText(post.body)}</div>
              ) : null}
            </div>
          ) : (
            <div className="circuit-thought-card">
              <p>No media</p>
            </div>
          )}

          <div className="circuit-viewer-overlay-actions">
            {isOwner ? (
              <>
                {post.post_type !== "event" && onEdit ? (
                  <button
                    type="button"
                    className="circuit-viewer-overlay-btn"
                    disabled={busy}
                    onClick={() => onEdit(post)}
                  >
                    Edit
                  </button>
                ) : null}
                <button
                  type="button"
                  className="circuit-viewer-overlay-btn circuit-viewer-overlay-danger"
                  disabled={busy}
                  onClick={() => void deleteOwn()}
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                className="circuit-viewer-overlay-btn"
                disabled={busy}
                onClick={() => setReportOpen(true)}
              >
                Flag
              </button>
            )}
          </div>

          <button
            type="button"
            className={`circuit-viewer-react-fab${engageOpen ? " active" : ""}`}
            aria-label={isEvent ? (engageOpen ? "Hide event actions" : "Event actions") : engageOpen ? "Hide reactions and comments" : "React and comment"}
            aria-expanded={engageOpen}
            onClick={() => setEngageOpen((v) => !v)}
          >
            <MessageCircle size={20} strokeWidth={2.25} />
            <span>{isEvent ? "RSVP" : "React"}</span>
          </button>
        </div>

        {showEngageRail ? engagePanel : null}
      </div>

      {post.post_type === "media" && mediaCount > 1 ? (
        <div className="circuit-dots" aria-label="Media pages">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={i === mediaIndex ? "active" : ""}
              aria-label={`Media ${i + 1}`}
              onClick={() => setMediaIndex(i)}
            />
          ))}
        </div>
      ) : null}

      <div className="circuit-viewer-progress">
        {index + 1} / {posts.length}
      </div>
      {error ? <div className="circuit-strip-error circuit-viewer-error">{error}</div> : null}

      {showEngageSheet ? (
        <div
          className="circuit-engage-sheet-backdrop"
          role="presentation"
          onClick={() => {
            setSheetDragY(0);
            setEngageOpen(false);
          }}
        >
          <div
            className={`circuit-engage-sheet${sheetDragging ? " dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={isEvent ? "Event actions" : "Reactions and comments"}
            onClick={(e) => e.stopPropagation()}
            style={
              sheetDragY > 0
                ? { transform: `translateY(${sheetDragY}px)` }
                : undefined
            }
          >
            <div
              className="circuit-engage-sheet-grab"
              onTouchStart={onSheetGrabStart}
              onTouchMove={onSheetGrabMove}
              onTouchEnd={onSheetGrabEnd}
              onTouchCancel={onSheetGrabCancel}
            >
              <div className="circuit-engage-sheet-handle" aria-hidden="true" />
              <div className="circuit-engage-sheet-top">
                <strong>{isEvent ? "Event" : "React & comment"}</strong>
                <button
                  type="button"
                  className="circuit-engage-sheet-close"
                  aria-label="Close"
                  onClick={() => {
                    setSheetDragY(0);
                    setEngageOpen(false);
                  }}
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>
            {engagePanel}
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="circuit-flag-backdrop" role="dialog" aria-modal="true" aria-label="Flag content">
          <div className="circuit-flag-sheet">
            <strong>Flag inappropriate content</strong>
            <p>
              Choose a reason. A copy is saved for admins and the tile is removed from the Circuit.
            </p>
            <div className="circuit-flag-list">
              {FLAG_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  disabled={busy}
                  onClick={() => void report(cat)}
                >
                  {FLAG_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <button type="button" className="circuit-flag-cancel" disabled={busy} onClick={() => setReportOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
