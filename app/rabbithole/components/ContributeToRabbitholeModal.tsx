"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import type { Theme } from "../../lib/theme";
import {
  createRabbitholeAssetRecord,
  createRabbitholeContribution,
  createRabbitholeTopic,
  fetchRabbitholeTopics,
} from "../lib/dataClient";
import { uploadRabbitholeAsset } from "../lib/storageService";
import type { RabbitholeContentType, RabbitholeTopic } from "../lib/types";

type Props = {
  onClose: () => void;
  onCreated: (contributionId: string) => void;
};

const CONTENT_TYPES: Array<{ type: RabbitholeContentType; label: string; helper: string }> = [
  { type: "document", label: "Document", helper: "White papers, PDFs, docs links." },
  { type: "video", label: "Media", helper: "Podcasts, YouTube, and uploaded videos." },
  { type: "article_news", label: "Article / News", helper: "Industry updates and analysis." },
  { type: "external_link", label: "External Link", helper: "Useful external pages and references." },
  { type: "resource", label: "Resource", helper: "Templates, tools, and reusable references." },
];

function normalizeTag(value: string): string {
  return value.toLowerCase().trim();
}

function parseYoutubeId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      const candidate = url.pathname.split("/").filter(Boolean)[0];
      return candidate || null;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const segments = url.pathname.split("/").filter(Boolean);
      const embedIndex = segments.findIndex((part) => part === "embed");
      if (embedIndex >= 0 && segments[embedIndex + 1]) return segments[embedIndex + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function mergeTags(existing: string[], rawInput: string): string[] {
  const parts = rawInput.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return existing;
  const normalized = new Set(existing.map(normalizeTag));
  const next = [...existing];
  for (const part of parts) {
    const key = normalizeTag(part);
    if (!normalized.has(key)) {
      next.push(part);
      normalized.add(key);
    }
  }
  return next;
}

export default function ContributeToRabbitholeModal({ onClose, onCreated }: Props) {
  const { t } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [contentType, setContentType] = useState<RabbitholeContentType | null>(null);
  const [topics, setTopics] = useState<RabbitholeTopic[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchRabbitholeTopics(supabase).then((data) => {
      setTopics(data);
      setCategorySlug(data[0]?.slug ?? "");
    });
  }, []);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedType = useMemo(
    () => CONTENT_TYPES.find((entry) => entry.type === contentType) ?? null,
    [contentType]
  );

  function commitTagInput(raw: string) {
    setTags((prev) => mergeTags(prev, raw));
    setTagInput("");
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTagInput(tagInput);
      return;
    }
    if (e.key === "Backspace" && !tagInput) setTags((prev) => prev.slice(0, -1));
  }

  function handleCategoryChange(value: string) {
    if (value === "__other__") {
      setShowNewCategoryInput(true);
      setNewCategoryError(null);
      // Defer focus until the input is mounted.
      setTimeout(() => newCategoryInputRef.current?.focus(), 0);
      return;
    }
    setShowNewCategoryInput(false);
    setNewCategoryName("");
    setNewCategoryError(null);
    setCategorySlug(value);
  }

  async function commitNewCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setNewCategoryError("Type a category name first.");
      return;
    }
    setCreatingCategory(true);
    setNewCategoryError(null);
    const result = await createRabbitholeTopic(supabase, name);
    setCreatingCategory(false);
    if (!result.ok || !result.topic) {
      setNewCategoryError(result.error ?? "Could not add category.");
      return;
    }
    const topic = result.topic;
    setTopics((prev) => {
      if (prev.some((entry) => entry.slug === topic.slug)) return prev;
      return [...prev, topic];
    });
    setCategorySlug(topic.slug);
    setShowNewCategoryInput(false);
    setNewCategoryName("");
  }

  function handleNewCategoryKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitNewCategory();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowNewCategoryInput(false);
      setNewCategoryName("");
      setNewCategoryError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contentType) {
      setError("Choose a content type.");
      return;
    }
    if (!title.trim() || !categorySlug || !summary.trim()) {
      setError("Title, category, and summary are required.");
      return;
    }
    if (showNewCategoryInput && newCategoryName.trim()) {
      setError('Press "Add" to save the new category before continuing.');
      return;
    }
    if (summary.trim().length < 20) {
      setError("Summary must be at least 20 characters.");
      return;
    }

    const finalTags = mergeTags(tags, tagInput);
    if (finalTags.length === 0) {
      setError("Add at least one tag.");
      return;
    }

    const trimmedUrl = sourceUrl.trim();
    if (contentType === "video") {
      if (!trimmedUrl || !parseYoutubeId(trimmedUrl)) {
        setError("Media must be a valid YouTube URL.");
        return;
      }
    } else if (contentType === "article_news" || contentType === "external_link" || contentType === "document") {
      if (contentType !== "document" && !trimmedUrl) {
        setError("A source URL is required for this content type.");
        return;
      }
      if (trimmedUrl) {
        try {
          new URL(trimmedUrl);
        } catch {
          setError("Source URL is invalid.");
          return;
        }
      }
    }
    if (contentType === "document" && trimmedUrl.length === 0 && files.length === 0) {
      setError("Add a file or a source URL for document contributions.");
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (contentType === "video" && trimmedUrl) {
      metadata.youtubeId = parseYoutubeId(trimmedUrl);
    }

    setSubmitting(true);
    setError(null);

    const result = await createRabbitholeContribution(supabase, {
      contentType,
      categorySlug,
      title: title.trim(),
      summary: summary.trim(),
      tags: finalTags,
      sourceUrl: trimmedUrl || undefined,
      metadata,
    });

    if (!result.ok || !result.contributionId) {
      setSubmitting(false);
      setError(result.error ?? "Could not create contribution.");
      return;
    }

    if (files.length > 0) {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        setSubmitting(false);
        setError("You must be logged in to upload files.");
        return;
      }

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const upload = await uploadRabbitholeAsset(supabase, {
          file,
          contributionId: result.contributionId,
          uploaderUserId: userId,
        });
        if (!upload.ok) {
          setSubmitting(false);
          setError(upload.error);
          return;
        }

        const assetRecord = await createRabbitholeAssetRecord(supabase, {
          contributionId: result.contributionId,
          storageProvider: upload.locator.storageProvider,
          bucket: upload.locator.bucket,
          objectKey: upload.locator.objectKey,
          uploadedBy: userId,
          originalFilename: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          accessLevel: "private",
          isPrimary: i === 0,
        });
        if (!assetRecord.ok) {
          setSubmitting(false);
          setError(assetRecord.error ?? "Could not save file metadata.");
          return;
        }
      }
    }

    setSubmitting(false);
    onCreated(result.contributionId);
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 10070,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contribute to RabbitHole"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: t.surface,
          color: t.text,
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Contribute to RabbitHole</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              Structured archive contribution. Feed/group filing stays unchanged.
            </div>
          </div>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>Close</button>
        </div>

        {step === 1 ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13, color: t.textMuted }}>Step 1 of 2 · Choose content type</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              {CONTENT_TYPES.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  onClick={() => {
                    setContentType(entry.type);
                    setStep(2);
                  }}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{entry.label}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{entry.helper}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: t.textMuted }}>
              Step 2 of 2 · {selectedType?.label ?? "Contribution details"}
            </div>

            <label style={labelStyle}>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Clear, searchable title"
                style={inputStyle(t)}
              />
            </label>

            <label style={labelStyle}>
              Category
              <select
                value={showNewCategoryInput ? "__other__" : categorySlug}
                onChange={(e) => handleCategoryChange(e.target.value)}
                required
                style={inputStyle(t)}
              >
                {topics.map((topic) => (
                  <option key={topic.slug} value={topic.slug}>
                    {topic.name}
                  </option>
                ))}
                <option value="__other__">Other (add new)…</option>
              </select>
              {showNewCategoryInput && (
                <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      ref={newCategoryInputRef}
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={handleNewCategoryKeyDown}
                      maxLength={60}
                      placeholder="Type new category, press Enter"
                      style={{ ...inputStyle(t), flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => void commitNewCategory()}
                      disabled={creatingCategory || !newCategoryName.trim()}
                      style={buttonPrimary(creatingCategory || !newCategoryName.trim())}
                    >
                      {creatingCategory ? "Adding..." : "Add"}
                    </button>
                  </div>
                  {newCategoryError && (
                    <span style={{ fontSize: 12, color: "#dc2626" }}>{newCategoryError}</span>
                  )}
                  <span style={{ fontSize: 11, color: t.textMuted }}>
                    Adds the category to the shared library and selects it for this contribution.
                  </span>
                </div>
              )}
            </label>

            <label style={labelStyle}>
              Summary
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                minLength={20}
                rows={4}
                placeholder="Why this is valuable to archive."
                style={{ ...inputStyle(t), resize: "vertical" }}
              />
              <span style={{ fontSize: 11, color: t.textMuted }}>Minimum 20 characters</span>
            </label>

            {(contentType === "video" || contentType === "article_news" || contentType === "external_link" || contentType === "document") && (
              <label style={labelStyle}>
                Source URL
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                  placeholder={contentType === "video" ? "https://www.youtube.com/watch?v=..." : "https://..."}
                  style={inputStyle(t)}
                />
              </label>
            )}

            {(contentType === "document" || contentType === "resource") && (
              <label style={labelStyle}>
                Upload files
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const nextFiles = Array.from(e.target.files ?? []);
                    setFiles(nextFiles);
                  }}
                  style={inputStyle(t)}
                />
                <span style={{ fontSize: 11, color: t.textMuted }}>
                  {files.length === 0
                    ? "No files selected"
                    : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
                </span>
              </label>
            )}

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: t.text, fontWeight: 700 }}>Tags</span>
              <div
                onClick={() => tagInputRef.current?.focus()}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  background: t.input ?? t.surface,
                  minHeight: 40,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "6px 8px",
                }}
              >
                {tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 12,
                      borderRadius: 999,
                      border: `1px solid ${t.border}`,
                      padding: "2px 8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((entry) => entry !== tag))}
                      style={{ border: "none", background: "transparent", color: t.textMuted, cursor: "pointer", padding: 0 }}
                      aria-label={`Remove ${tag}`}
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
                  onBlur={() => {
                    if (tagInput.trim()) commitTagInput(tagInput);
                  }}
                  placeholder={tags.length ? "" : "Type tag, press Enter"}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: t.text,
                    minWidth: 120,
                    flex: 1,
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: t.textMuted }}>At least one tag required for retrieval quality.</span>
            </div>

            {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button type="button" onClick={() => setStep(1)} style={buttonGhost(t)}>
                Back
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={onClose} style={buttonGhost(t)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={buttonPrimary(submitting)}>
                  {submitting ? "Saving..." : "Save to RabbitHole"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
};

function inputStyle(t: Theme): React.CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: "8px 10px",
    background: t.input ?? t.surface,
    color: t.text,
    boxSizing: "border-box",
  };
}

function buttonGhost(t: Theme): React.CSSProperties {
  return {
    border: `1px solid ${t.border}`,
    background: "transparent",
    color: t.textMuted,
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function buttonPrimary(disabled: boolean): React.CSSProperties {
  return {
    border: "none",
    borderRadius: 8,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: disabled ? "default" : "pointer",
    background: disabled ? "#64748b" : "#facc15",
    color: disabled ? "#e2e8f0" : "#0f172a",
  };
}
