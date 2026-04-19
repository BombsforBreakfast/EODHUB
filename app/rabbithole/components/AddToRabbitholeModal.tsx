"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { fetchRabbitholeTopics, promotePostToRabbithole, promoteUnitPostToRabbithole } from "../lib/dataClient";
import type { RabbitholeTopic } from "../lib/types";

type SourcePost = {
  id: string;
  content: string;
  og_title?: string | null;
};

type Props = {
  open: boolean;
  /** The post to file. Set sourceType to indicate which table it lives in. */
  post: SourcePost;
  sourceType?: "feed" | "unit";
  onClose: () => void;
  onSuccess: (threadId: string) => void;
};

function normalizeTag(value: string): string {
  return value.toLowerCase().trim();
}

function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
}

export default function AddToRabbitholeModal({ open, post, sourceType = "feed", onClose, onSuccess }: Props) {
  const [topics, setTopics] = useState<RabbitholeTopic[]>([]);
  const [topicSlug, setTopicSlug] = useState("");
  const [title, setTitle] = useState("");
  const [curatorNote, setCuratorNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const derivedTitle = post.og_title?.trim() || firstLine(post.content) || "";
    setTitle(derivedTitle);
    setCuratorNote("");
    setTagInput("");
    setTags([]);
    setError(null);
    setSubmitting(false);

    fetchRabbitholeTopics(supabase).then((data) => {
      setTopics(data);
      setTopicSlug(data[0]?.slug ?? "");
    });
  }, [open, post]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function commitTagInput(raw: string) {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setTags((prev) => {
      const normalizedExisting = new Set(prev.map(normalizeTag));
      const next = [...prev];
      for (const part of parts) {
        if (part && !normalizedExisting.has(normalizeTag(part))) {
          next.push(part);
          normalizedExisting.add(normalizeTag(part));
        }
      }
      return next;
    });
    setTagInput("");
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTagInput(tagInput);
    } else if (e.key === "Backspace" && tagInput === "") {
      setTags((prev) => prev.slice(0, -1));
    } else if (e.key === ",") {
      e.preventDefault();
      commitTagInput(tagInput);
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topicSlug || !title.trim()) return;

    const finalTags = [...tags];
    if (tagInput.trim()) {
      tagInput.split(",").map((p) => p.trim()).filter(Boolean).forEach((part) => {
        if (!finalTags.map(normalizeTag).includes(normalizeTag(part))) finalTags.push(part);
      });
    }

    setSubmitting(true);
    setError(null);

    const result = sourceType === "unit"
      ? await promoteUnitPostToRabbithole(supabase, {
          unitPostId: post.id,
          title: title.trim(),
          curatorNote: curatorNote.trim(),
          topicSlug,
          tags: finalTags,
        })
      : await promotePostToRabbithole(supabase, {
          postId: post.id,
          title: title.trim(),
          curatorNote: curatorNote.trim(),
          topicSlug,
          tags: finalTags,
        });

    setSubmitting(false);

    if (!result.ok || !result.threadId) {
      setError(result.error ?? "Could not add to Rabbithole. Try again.");
      return;
    }
    onSuccess(result.threadId);
  }

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10060,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to Rabbithole"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "grid",
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/rabbithole-btn.png" alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#f8fafc" }}>Add to Rabbithole</div>
              {sourceType === "unit" && (
                <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>From group forum</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          {/* Title */}
          <label style={labelStyle}>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Thread title"
              style={inputStyle}
            />
          </label>

          {/* Topic */}
          <label style={labelStyle}>
            Topic
            <select
              value={topicSlug}
              onChange={(e) => setTopicSlug(e.target.value)}
              required
              style={inputStyle}
            >
              {topics.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </label>

          {/* Curator's Note */}
          <label style={labelStyle}>
            Curator&apos;s Note
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 400, marginLeft: 6 }}>optional · 200 chars max</span>
            <textarea
              value={curatorNote}
              onChange={(e) => setCuratorNote(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="Why is this worth archiving? Leave blank to let the post speak for itself."
              style={{ ...inputStyle, resize: "vertical" }}
            />
            {curatorNote.length > 150 && (
              <span style={{ fontSize: 11, color: curatorNote.length >= 200 ? "#fca5a5" : "#94a3b8", textAlign: "right" }}>
                {200 - curatorNote.length} chars left
              </span>
            )}
          </label>

          {/* Tags */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 700 }}>Tags</span>
            <div
              onClick={() => tagInputRef.current?.focus()}
              style={{
                border: "1px solid #334155",
                borderRadius: 10,
                padding: "6px 10px",
                background: "#0f172a",
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                cursor: "text",
                minHeight: 42,
                alignItems: "center",
              }}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 12,
                    color: "#e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag}`}
                    style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => { if (tagInput.trim()) commitTagInput(tagInput); }}
                placeholder={tags.length === 0 ? "Type a tag, press Enter or comma" : ""}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#f8fafc",
                  fontSize: 13,
                  flex: 1,
                  minWidth: 120,
                }}
              />
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
              Tags power search — they stay hidden on the index page.
            </p>
          </div>

          {error && <div style={{ color: "#fca5a5", fontSize: 13 }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: 10,
                padding: "9px 16px",
                color: "#94a3b8",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !topicSlug || topics.length === 0 || !title.trim()}
              style={{
                background: submitting ? "#475569" : "#facc15",
                border: "none",
                borderRadius: 10,
                padding: "9px 18px",
                color: submitting ? "#e2e8f0" : "#0f172a",
                fontWeight: 800,
                cursor: submitting || !topicSlug || topics.length === 0 || !title.trim() ? "default" : "pointer",
                fontSize: 14,
              }}
            >
              {submitting ? "Filing to Rabbithole…" : "Add to Rabbithole"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "#cbd5e1",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: 14,
  boxSizing: "border-box",
};
