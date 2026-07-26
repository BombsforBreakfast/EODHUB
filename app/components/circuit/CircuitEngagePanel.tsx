"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REACTION_ORDER,
  REACTION_META,
  type ReactionType,
} from "../../lib/reactions/types";
import { getAccessToken } from "../../lib/lib/supabaseClient";

export type CircuitCommentDto = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
  author_photo_url: string | null;
};

type Props = {
  postId: string;
  currentUserId?: string;
};

export default function CircuitEngagePanel({ postId }: Props) {
  const [loading, setLoading] = useState(true);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [counts, setCounts] = useState<Partial<Record<ReactionType, number>>>({});
  const [comments, setComments] = useState<CircuitCommentDto[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const token = await getAccessToken({ source: "CircuitEngage.load" });
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/circuit/${postId}/engage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        my_reaction?: ReactionType | null;
        reaction_counts?: Partial<Record<ReactionType, number>>;
        comments?: CircuitCommentDto[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not load reactions.");
        return;
      }
      setMyReaction(body.my_reaction ?? null);
      setCounts(body.reaction_counts ?? {});
      setComments(body.comments ?? []);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const react = async (reactionType: ReactionType) => {
    const token = await getAccessToken({ source: "CircuitEngage.react" });
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/circuit/${postId}/engage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "react", reaction_type: reactionType }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        my_reaction?: ReactionType | null;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not react.");
        return;
      }
      setPickerOpen(false);
      await load();
      if (body.my_reaction !== undefined) setMyReaction(body.my_reaction);
    } finally {
      setBusy(false);
    }
  };

  const comment = async () => {
    const text = draft.trim();
    if (!text) return;
    const token = await getAccessToken({ source: "CircuitEngage.comment" });
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/circuit/${postId}/engage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "comment", body: text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        comment?: CircuitCommentDto;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not comment.");
        return;
      }
      if (body.comment) setComments((prev) => [...prev, body.comment!]);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const top = DEFAULT_REACTION_ORDER.filter((rt) => (counts[rt] ?? 0) > 0).slice(0, 4);

  return (
    <div className="circuit-engage">
      <div className="circuit-engage-reacts">
        <button
          type="button"
          className={`circuit-engage-react-btn${myReaction ? " active" : ""}`}
          disabled={busy || loading}
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
        >
          {myReaction ? REACTION_META[myReaction].emoji : "＋"} React
          {total > 0 ? ` · ${total}` : ""}
        </button>
        {top.map((rt) => (
          <span key={rt} className="circuit-engage-chip" title={REACTION_META[rt].ariaLabel}>
            {REACTION_META[rt].emoji} {counts[rt]}
          </span>
        ))}
      </div>

      {pickerOpen ? (
        <div className="circuit-engage-picker" role="listbox" aria-label="Reactions">
          {DEFAULT_REACTION_ORDER.map((rt) => (
            <button
              key={rt}
              type="button"
              className={myReaction === rt ? "active" : ""}
              disabled={busy}
              onClick={() => void react(rt)}
              aria-label={REACTION_META[rt].ariaLabel}
              title={REACTION_META[rt].ariaLabel}
            >
              {REACTION_META[rt].emoji}
            </button>
          ))}
        </div>
      ) : null}

      <div className="circuit-engage-comments">
        {loading && comments.length === 0 ? (
          <div className="circuit-engage-empty">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="circuit-engage-empty">No comments yet</div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="circuit-engage-comment">
              {c.author_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.author_photo_url} alt="" />
              ) : (
                <span className="circuit-engage-comment-fallback">
                  {c.author_name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <strong>{c.author_name}</strong>
                <p>{c.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="circuit-engage-compose">
        <input
          type="text"
          value={draft}
          maxLength={280}
          placeholder="Add a comment…"
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void comment();
            }
          }}
        />
        <button type="button" disabled={busy || !draft.trim()} onClick={() => void comment()}>
          Send
        </button>
      </div>
      {error ? <div className="circuit-strip-error">{error}</div> : null}
    </div>
  );
}
