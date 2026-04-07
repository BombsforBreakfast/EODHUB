/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { track } from "@vercel/analytics";
import BreadcrumbTrail from "../../components/BreadcrumbTrail";
import RabbitholeShell from "../../components/RabbitholeShell";
import { getThreadBreadcrumb, parseTrail } from "../../lib/helpers";
import { supabase } from "../../../lib/lib/supabaseClient";
import { createRabbitholeReply, fetchRabbitholeThreadDetail } from "../../lib/dataClient";
import type { RabbitholeReply, RabbitholeThread } from "../../lib/types";

export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const threadId = params.id;
  const [thread, setThread] = useState<RabbitholeThread | null>(null);
  const [replies, setReplies] = useState<RabbitholeReply[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tunnelTrail = useMemo(() => parseTrail(searchParams.get("trail") ?? ""), [searchParams]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const data = await fetchRabbitholeThreadDetail(supabase, threadId);
      if (!mounted) return;
      setThread(data.thread);
      setReplies(data.replies);
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [threadId]);

  useEffect(() => {
    if (!thread) return;
    track("rabbithole_thread_opened", { threadId: thread.id, topic: thread.topicSlug });
  }, [thread]);

  async function handleReplySubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const body = replyBody.trim();
    if (!body || !thread) return;
    setPosting(true);
    const result = await createRabbitholeReply(supabase, { threadId: thread.id, body });
    if (!result.ok) {
      setError(result.error ?? "Unable to post reply.");
      setPosting(false);
      return;
    }
    setReplyBody("");
    track("rabbithole_reply_posted", { threadId: thread.id });
    const refreshed = await fetchRabbitholeThreadDetail(supabase, thread.id);
    setThread(refreshed.thread);
    setReplies(refreshed.replies);
    setPosting(false);
  }

  if (loading) {
    return (
      <RabbitholeShell title="Loading thread...">
        <p style={{ color: "#94a3b8" }}>Loading thread details...</p>
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

  const canonicalPath = getThreadBreadcrumb(thread);

  return (
    <RabbitholeShell title={thread.title} description={`Thread by ${thread.author}`}>
      <BreadcrumbTrail
        label="Library Path"
        steps={[
          { label: "Rabbithole", href: "/rabbithole" },
          ...(canonicalPath[0] ? [{ label: canonicalPath[0], href: `/rabbithole/${thread.topicSlug}` }] : []),
          ...canonicalPath.slice(1).map((item) => ({ label: item })),
        ]}
      />
      {tunnelTrail.length > 0 && (
        <BreadcrumbTrail label="Your Tunnel" steps={tunnelTrail.map((step) => ({ label: step }))} />
      )}

      <article style={{ border: "1px solid #334155", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <p style={{ margin: 0, color: "#cbd5e1", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{thread.body}</p>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {thread.tags.map((tag) => (
            <span key={tag} style={{ border: "1px solid #334155", borderRadius: 999, padding: "4px 9px", fontSize: 12, color: "#e2e8f0" }}>
              {tag}
            </span>
          ))}
        </div>
      </article>

      <section style={{ border: "1px solid #334155", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Replies</h2>
        {replies.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No replies yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {replies.map((reply) => (
              <article key={reply.id} style={{ borderTop: "1px solid #1e293b", paddingTop: 10 }}>
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>
                  {reply.author} · {new Date(reply.createdAt).toLocaleString()}
                </div>
                <p style={{ margin: 0, color: "#e2e8f0" }}>{reply.body}</p>
              </article>
            ))}
          </div>
        )}
        <form onSubmit={handleReplySubmit} style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={4}
            placeholder="Add your technical reply..."
            style={{
              width: "100%",
              border: "1px solid #334155",
              borderRadius: 10,
              padding: "10px 12px",
              background: "#0f172a",
              color: "#f8fafc",
            }}
          />
          <button
            type="submit"
            disabled={posting}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "9px 14px",
              width: "fit-content",
              background: posting ? "#475569" : "#facc15",
              color: posting ? "#e2e8f0" : "#0f172a",
              fontWeight: 800,
              cursor: posting ? "default" : "pointer",
            }}
          >
            {posting ? "Posting..." : "Post Reply"}
          </button>
          {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}
        </form>
      </section>
    </RabbitholeShell>
  );
}
