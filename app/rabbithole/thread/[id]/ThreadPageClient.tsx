/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
import Link from "next/link";
import { Flag, Trash2 } from "lucide-react";
import BreadcrumbTrail from "../../components/BreadcrumbTrail";
import RabbitholeShell from "../../components/RabbitholeShell";
import { KangarooCourtVerdictBanner } from "../../../components/KangarooCourtVerdictBanner";
import IsolatedPost from "../../components/IsolatedPost";
import { parseTrail } from "../../lib/helpers";
import { supabase } from "../../../lib/lib/supabaseClient";
import { fetchRabbitholeThreadDetail } from "../../lib/dataClient";
import type { KangarooCourtVerdictRow } from "../../../lib/kangarooCourt";
import type { RabbitholeThread } from "../../lib/types";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../../../lib/flagCategories";

export default function ThreadPageClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = params.id;

  const [thread, setThread] = useState<RabbitholeThread | null>(null);
  const [kcVerdict, setKcVerdict] = useState<KangarooCourtVerdictRow | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagCategory, setFlagCategory] = useState<FlagCategory>("general");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  const tunnelTrail = useMemo(() => parseTrail(searchParams.get("trail") ?? ""), [searchParams]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id ?? null;
      setViewerUserId(userId);
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("user_id", userId)
          .maybeSingle();
        setViewerIsAdmin(!!(profile as { is_admin?: boolean } | null)?.is_admin);
      } else {
        setViewerIsAdmin(false);
      }
    });
  }, []);

  async function withAuthToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleDeleteThread() {
    if (!thread || deleteBusy) return;
    const isAuthor = viewerUserId === thread.author;
    const promptMsg = isAuthor
      ? "Remove this thread from RabbitHole? The original post stays in the feed."
      : "Remove this thread as a moderator? The original post stays in the feed.";
    if (!window.confirm(promptMsg)) return;
    setDeleteBusy(true);
    setActionError(null);
    const token = await withAuthToken();
    if (!token) {
      setDeleteBusy(false);
      setActionError("You must be logged in.");
      return;
    }
    const res = await fetch(`/api/rabbithole/threads/${encodeURIComponent(thread.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    setDeleteBusy(false);
    if (!res.ok) {
      setActionError(json?.error ?? "Could not delete thread.");
      return;
    }
    router.push("/rabbithole");
  }

  async function submitFlag() {
    if (!thread || flagBusy) return;
    setFlagBusy(true);
    setFlagError(null);
    const token = await withAuthToken();
    if (!token) {
      setFlagBusy(false);
      setFlagError("You must be logged in.");
      return;
    }
    const res = await fetch("/api/flag-content", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        contentType: "rabbithole_thread",
        contentId: thread.id,
        category: flagCategory,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setFlagBusy(false);
    if (!res.ok) {
      setFlagError(json?.error ?? "Could not submit flag.");
      return;
    }
    setFlagOpen(false);
    router.push("/rabbithole");
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setKcVerdict(null);

      const data = await fetchRabbitholeThreadDetail(supabase, threadId);
      if (!mounted) return;
      setThread(data.thread);

      // Fetch live KC verdict for the source post (feed only; unit posts follow KC separately)
      const postId = data.thread?.promotedFromPostId;
      if (postId) {
        const { data: courtRow } = await supabase
          .from("kangaroo_courts")
          .select("id, status")
          .eq("feed_post_id", postId)
          .eq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (courtRow?.id) {
          const { data: verdictRow } = await supabase
            .from("kangaroo_court_verdicts")
            .select("id, court_id, winning_option_id, winning_label_snapshot, total_votes, body, created_at")
            .eq("court_id", courtRow.id)
            .maybeSingle();
          if (mounted) setKcVerdict((verdictRow as KangarooCourtVerdictRow) ?? null);
        }
      }

      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [threadId]);

  useEffect(() => {
    if (!thread) return;
    track("rabbithole_thread_opened", { threadId: thread.id, topic: thread.topicSlug });
  }, [thread]);

  if (loading) {
    return (
      <RabbitholeShell title="Loading...">
        <p style={{ color: "#94a3b8" }}>Loading thread...</p>
      </RabbitholeShell>
    );
  }

  if (!thread) {
    return (
      <RabbitholeShell title="Thread not found">
        <p style={{ color: "#94a3b8" }}>This thread is unavailable.</p>
      </RabbitholeShell>
    );
  }

  const sourcePostId = thread.sourceType === "unit"
    ? thread.promotedFromUnitPostId
    : thread.promotedFromPostId;

  const librarySteps = [
    { label: "Rabbithole", href: "/rabbithole" },
    ...(thread.topicName ? [{ label: thread.topicName, href: `/rabbithole/${thread.topicSlug}` }] : []),
    ...(thread.subtopic ? [{ label: thread.subtopic, href: `/rabbithole/${thread.topicSlug}` }] : []),
    ...thread.tags.map((tag) => ({
      label: `#${tag}`,
      href: `/rabbithole?tag=${encodeURIComponent(tag)}`,
    })),
  ];

  return (
    <RabbitholeShell title={thread.title}>
      <BreadcrumbTrail label="Library Path" steps={librarySteps} />
      {tunnelTrail.length > 0 && (
        <BreadcrumbTrail
          label="Your Tunnel"
          steps={tunnelTrail.map((step) => ({ label: step }))}
        />
      )}

      {/* Title */}
      <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>
        {thread.title}
      </h1>

      {/* Topic / subtopic */}
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        {thread.topicName}{thread.subtopic ? ` · ${thread.subtopic}` : ""}
      </div>

      {/* Author/admin/flag actions for the thread itself. The underlying post
          (rendered by IsolatedPost below) has its own delete/edit/flag controls
          owned by that surface. */}
      {viewerUserId && (() => {
        const isAuthor = viewerUserId === thread.author;
        const canDelete = isAuthor || viewerIsAdmin;
        const canFlag = !isAuthor;
        if (!canDelete && !canFlag) return null;
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteThread}
                disabled={deleteBusy}
                style={{
                  border: "1px solid #7f1d1d",
                  borderRadius: 8,
                  background: deleteBusy ? "#1f2937" : "rgba(239,68,68,0.12)",
                  color: deleteBusy ? "#94a3b8" : "#fca5a5",
                  padding: "6px 10px",
                  cursor: deleteBusy ? "default" : "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Trash2 size={14} />
                {deleteBusy ? "Removing..." : isAuthor ? "Remove from RabbitHole" : "Remove (admin)"}
              </button>
            )}
            {canFlag && (
              <button
                type="button"
                onClick={() => {
                  setFlagOpen(true);
                  setFlagError(null);
                  setFlagCategory("general");
                }}
                style={{
                  border: "1px solid #334155",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#cbd5e1",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Flag size={14} /> Flag thread
              </button>
            )}
          </div>
        );
      })()}
      {actionError && (
        <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>{actionError}</div>
      )}

      {/* Tag pills */}
      {thread.tags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {thread.tags.map((tag) => (
            <Link
              key={tag}
              href={`/rabbithole?tag=${encodeURIComponent(tag)}`}
              title={`Filter by "${tag}"`}
              style={{
                border: "1px solid #334155",
                borderRadius: 999,
                padding: "3px 9px",
                fontSize: 12,
                color: "#94a3b8",
                textDecoration: "none",
              }}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* KC verdict (feed posts only) */}
      {kcVerdict && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Kangaroo Court — Source Post Verdict
          </div>
          <KangarooCourtVerdictBanner verdict={kcVerdict} />
        </div>
      )}

      {/* Isolated post — live content, likes, comments from the original table */}
      {sourcePostId ? (
        <IsolatedPost
          sourceType={thread.sourceType}
          sourcePostId={sourcePostId}
          viewerUserId={viewerUserId}
          curatorNote={thread.curatorNote}
        />
      ) : (
        <div
          style={{
            padding: 16,
            border: "1px solid #334155",
            borderRadius: 12,
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          {thread.curatorNote || "No original post available."}
        </div>
      )}
      {flagOpen && (
        <div
          role="presentation"
          onClick={() => !flagBusy && setFlagOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 10100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Flag RabbitHole thread"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f8fafc",
              padding: 16,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 16 }}>Flag thread</strong>
              <button
                type="button"
                onClick={() => setFlagOpen(false)}
                disabled={flagBusy}
                style={{
                  border: "1px solid #334155",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#94a3b8",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
              Flagged threads are hidden pending admin review.
            </p>
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
              Reason
              <select
                value={flagCategory}
                onChange={(e) => setFlagCategory(e.target.value as FlagCategory)}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "#0b1220",
                  color: "#f8fafc",
                  padding: "7px 9px",
                }}
              >
                {FLAG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {FLAG_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>
            {flagError && <div style={{ color: "#fca5a5", fontSize: 13 }}>{flagError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setFlagOpen(false)}
                disabled={flagBusy}
                style={{
                  border: "1px solid #334155",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#94a3b8",
                  padding: "7px 11px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFlag}
                disabled={flagBusy}
                style={{
                  border: "none",
                  borderRadius: 8,
                  background: flagBusy ? "#475569" : "#ef4444",
                  color: "#fff",
                  padding: "7px 12px",
                  cursor: flagBusy ? "default" : "pointer",
                  fontWeight: 800,
                }}
              >
                {flagBusy ? "Submitting..." : "Submit flag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RabbitholeShell>
  );
}
