"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { validateImagePick } from "@/app/lib/uploadLimits";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemType } from "./types";
import { prepareScrapbookUploadFile } from "@/app/lib/prepareUploadFile";

const MAX_SCRAPBOOK_PHOTOS = 10;

const SUCCESS_MSG_REVIEW =
  "Thanks for contributing. Your scrapbook item has been submitted for admin review.";
const SUCCESS_MSG_PUBLISHED = "Your scrapbook item has been published.";
const SUCCESS_MSG_REVIEW_BATCH = (count: number) =>
  `Thanks for contributing. Your ${count} scrapbook photos have been submitted for admin review.`;
const SUCCESS_MSG_PUBLISHED_BATCH = (count: number) =>
  `Your ${count} scrapbook photos have been published.`;

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  location: string;
  eventDate: string;
};

type Props = {
  open: boolean;
  memorialId?: string;
  targetId?: string;
  subjectType?: "memorial" | "event";
  onClose: () => void;
  onSubmitted: () => void;
  t: MemorialScrapbookTheme;
  accentColor: string;
};

export function AddScrapbookItemModal({
  open,
  memorialId,
  targetId,
  subjectType = "memorial",
  onClose,
  onSubmitted,
  t,
  accentColor,
}: Props) {
  const resolvedTargetId = targetId ?? memorialId ?? "";
  const tableName = subjectType === "event" ? "event_scrapbook_items" : "memorial_scrapbook_items";
  const fkColumn = subjectType === "event" ? "event_id" : "memorial_id";
  const subjectLabel = subjectType === "event" ? "event" : "memorial";
  const [itemType, setItemType] = useState<ScrapbookItemType>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photoStep, setPhotoStep] = useState<"pick" | "caption">("pick");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [articleThumb, setArticleThumb] = useState<string | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const [memoryBody, setMemoryBody] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState(SUCCESS_MSG_REVIEW);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function revokePendingPhotoUrls(photos: PendingPhoto[]) {
    for (const photo of photos) {
      URL.revokeObjectURL(photo.previewUrl);
    }
  }

  function resetForm() {
    setPendingPhotos((prev) => {
      revokePendingPhotoUrls(prev);
      return [];
    });
    setItemType("photo");
    setFile(null);
    setPhotoStep("pick");
    if (photoInputRef.current) photoInputRef.current.value = "";
    setExternalUrl("");
    setArticleThumb(null);
    setMemoryBody("");
    setCaption("");
    setLocation("");
    setEventDate("");
    setConfirmed(false);
    setError(null);
    setSuccess(false);
    setSuccessMessage(SUCCESS_MSG_REVIEW);
  }

  function close() {
    resetForm();
    onClose();
  }

  function addPhotosFromFiles(files: File[]) {
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const nextFile of files) {
      const pickError = validateImagePick(nextFile);
      if (pickError) {
        setError(pickError);
        continue;
      }
      validFiles.push(nextFile);
    }
    if (validFiles.length === 0) return;

    setPendingPhotos((prev) => {
      const remaining = MAX_SCRAPBOOK_PHOTOS - prev.length;
      if (remaining <= 0) {
        setError(`You can add up to ${MAX_SCRAPBOOK_PHOTOS} photos at a time.`);
        return prev;
      }

      const toAdd = validFiles.slice(0, remaining);
      if (validFiles.length > remaining) {
        setError(`Only the first ${remaining} photo${remaining === 1 ? "" : "s"} were added. Max is ${MAX_SCRAPBOOK_PHOTOS}.`);
      } else {
        setError(null);
      }

      return [
        ...prev,
        ...toAdd.map((nextFile) => ({
          id: crypto.randomUUID(),
          file: nextFile,
          previewUrl: URL.createObjectURL(nextFile),
          caption: "",
          location: "",
          eventDate: "",
        })),
      ];
    });
  }

  function removePendingPhoto(id: string) {
    setPendingPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((photo) => photo.id !== id);
      if (next.length === 0) setPhotoStep("pick");
      return next;
    });
    setError(null);
  }

  function updatePendingPhoto(id: string, patch: Partial<Pick<PendingPhoto, "caption" | "location" | "eventDate">>) {
    setPendingPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));
  }

  async function fetchArticlePreview() {
    setFetchingOg(true);
    setError(null);
    setArticleThumb(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const res = await fetch("/api/memorial-scrapbook/link-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: externalUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load preview");
      setArticleThumb(typeof json.image === "string" ? json.image : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setFetchingOg(false);
    }
  }

  async function uploadFile(f: File, uid: string): Promise<string> {
    const prepared = await prepareScrapbookUploadFile(f);
    if (!prepared.ok) throw new Error(prepared.error);
    f = prepared.file;
    const ext = (f.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "bin";
    const path = `${resolvedTargetId}/${uid}/${crypto.randomUUID()}.${safeExt}`;
    const { error: upErr } = await supabase.storage.from("memorial-scrapbook").upload(path, f, {
      upsert: false,
      contentType: f.type || undefined,
    });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from("memorial-scrapbook").getPublicUrl(path);
    return data.publicUrl;
  }

  async function submit() {
    setError(null);
    if (!resolvedTargetId) {
      setError("Missing scrapbook target.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm the content is respectful and appropriate.");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      window.location.href = "/login";
      return;
    }

    const { data: profileRow } = await supabase.from("profiles").select("is_admin").eq("user_id", uid).maybeSingle();
    const isAdminContributor = Boolean((profileRow as { is_admin?: boolean | null } | null)?.is_admin);

    setSubmitting(true);
    try {
      let fileUrl: string | null = null;
      let extUrl: string | null = null;
      let thumb: string | null = null;
      let memBody: string | null = null;
      let cap = caption.trim() || null;

      if (itemType === "photo") {
        if (pendingPhotos.length === 0) {
          setError("Please choose at least one photo.");
          return;
        }
        const status = (isAdminContributor ? "approved" : "pending") as "pending" | "approved";
        for (const photo of pendingPhotos) {
          const fileUrl = await uploadFile(photo.file, uid);
          const row = {
            [fkColumn]: resolvedTargetId,
            user_id: uid,
            item_type: "photo" as const,
            file_url: fileUrl,
            external_url: null,
            thumbnail_url: null,
            memory_body: null,
            caption: photo.caption.trim() || null,
            location: photo.location.trim() || null,
            event_date: photo.eventDate.trim() || null,
            status,
          };
          const { error: insErr } = await supabase.from(tableName).insert(row);
          if (insErr) throw new Error(insErr.message);
        }
      } else if (itemType === "document") {
        if (!file) {
          setError("Please choose a file to upload.");
          return;
        }
        fileUrl = await uploadFile(file, uid);
      } else if (itemType === "article") {
        if (!externalUrl.trim()) {
          setError("Please enter a website URL.");
          return;
        }
        extUrl = externalUrl.trim();
        thumb = articleThumb;
      } else {
        memBody = memoryBody.trim() || null;
        if (!memBody && !cap) {
          setError("Please enter your memory or a short caption.");
          return;
        }
      }

      if (itemType === "photo") {
        setSuccessMessage(
          isAdminContributor
            ? pendingPhotos.length === 1
              ? SUCCESS_MSG_PUBLISHED
              : SUCCESS_MSG_PUBLISHED_BATCH(pendingPhotos.length)
            : pendingPhotos.length === 1
              ? SUCCESS_MSG_REVIEW
              : SUCCESS_MSG_REVIEW_BATCH(pendingPhotos.length),
        );
      } else {
        setSuccessMessage(isAdminContributor ? SUCCESS_MSG_PUBLISHED : SUCCESS_MSG_REVIEW);
      }

      const row = itemType === "photo" ? null : {
        [fkColumn]: resolvedTargetId,
        user_id: uid,
        item_type: itemType,
        file_url: fileUrl,
        external_url: extUrl,
        thumbnail_url: thumb,
        memory_body: memBody,
        caption: cap,
        location: null,
        event_date: null,
        status: (isAdminContributor ? "approved" : "pending") as "pending" | "approved",
      };

      if (row) {
        const { error: insErr } = await supabase.from(tableName).insert(row);
        if (insErr) throw new Error(insErr.message);
      }

      setSuccess(true);
      onSubmitted();
      setTimeout(() => {
        close();
      }, 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={() => !submitting && !success && close()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
        boxSizing: "border-box",
        touchAction: "none",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scrapbook-add-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: itemType === "photo" && photoStep === "caption" ? 560 : 480,
          maxHeight: "min(90dvh, calc(100svh - max(32px, env(safe-area-inset-top)) - max(32px, env(safe-area-inset-bottom))))",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: t.surface,
          color: t.text,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
          padding: "20px 22px 22px",
          touchAction: "auto",
        }}
      >
        <div id="scrapbook-add-title" style={{ fontSize: 17, fontWeight: 800 }}>
          Add to scrapbook
        </div>
        {success ? (
          <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.55, color: t.textMuted }}>{successMessage}</p>
        ) : (
          <>
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>Item type</div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["photo", "Photo"],
                  ["article", "Article / link"],
                  ["document", "Document"],
                  ["memory", "Memory"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    if (v !== itemType) {
                      setPendingPhotos((prev) => {
                        revokePendingPhotoUrls(prev);
                        return [];
                      });
                      setPhotoStep("pick");
                      if (photoInputRef.current) photoInputRef.current.value = "";
                    }
                    setItemType(v);
                    setFile(null);
                    setError(null);
                    if (v !== "photo") {
                      setLocation("");
                      setEventDate("");
                    }
                  }}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${itemType === v ? accentColor : t.border}`,
                    background: itemType === v ? `${accentColor}22` : t.surfaceHover,
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 12,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {itemType === "photo" && photoStep === "pick" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Choose photos
                  <span style={{ fontWeight: 600, marginLeft: 6 }}>
                    ({pendingPhotos.length} of {MAX_SCRAPBOOK_PHOTOS})
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: t.textFaint, lineHeight: 1.45 }}>
                  Add up to {MAX_SCRAPBOOK_PHOTOS} photos at once, then caption each one before publishing.
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    addPhotosFromFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={pendingPhotos.length >= MAX_SCRAPBOOK_PHOTOS}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      fontWeight: 700,
                      fontSize: 12,
                      padding: "8px 12px",
                      cursor: pendingPhotos.length >= MAX_SCRAPBOOK_PHOTOS ? "not-allowed" : "pointer",
                      opacity: pendingPhotos.length >= MAX_SCRAPBOOK_PHOTOS ? 0.65 : 1,
                    }}
                  >
                    {pendingPhotos.length === 0 ? "Choose photos" : "Add more photos"}
                  </button>
                </div>
                {pendingPhotos.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {pendingPhotos.map((photo, index) => (
                      <div
                        key={photo.id}
                        style={{
                          position: "relative",
                          borderRadius: 10,
                          overflow: "hidden",
                          border: `1px solid ${t.border}`,
                          aspectRatio: "1 / 1",
                          background: t.surfaceHover,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.previewUrl}
                          alt={`Selected photo ${index + 1}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <button
                          type="button"
                          aria-label={`Remove photo ${index + 1}`}
                          onClick={() => removePendingPhoto(photo.id)}
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            border: "none",
                            background: "rgba(0,0,0,0.72)",
                            color: "#fff",
                            fontWeight: 800,
                            fontSize: 14,
                            lineHeight: 1,
                            cursor: "pointer",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {itemType === "photo" && photoStep === "caption" && (
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Add details for each photo
                </div>
                {pendingPhotos.map((photo, index) => (
                  <div
                    key={photo.id}
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 12,
                      padding: 12,
                      background: t.surfaceHover,
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt={`Photo ${index + 1}`}
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: "cover",
                          borderRadius: 10,
                          border: `1px solid ${t.border}`,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 10 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                          Photo {index + 1} caption (optional)
                          <input
                            value={photo.caption}
                            onChange={(e) => updatePendingPhoto(photo.id, { caption: e.target.value })}
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: 6,
                              boxSizing: "border-box",
                              borderRadius: 10,
                              border: `1px solid ${t.border}`,
                              background: t.surface,
                              color: t.text,
                              padding: "8px 10px",
                              fontSize: 14,
                            }}
                          />
                        </label>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                          Location (optional)
                          <input
                            value={photo.location}
                            onChange={(e) => updatePendingPhoto(photo.id, { location: e.target.value })}
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: 6,
                              boxSizing: "border-box",
                              borderRadius: 10,
                              border: `1px solid ${t.border}`,
                              background: t.surface,
                              color: t.text,
                              padding: "8px 10px",
                              fontSize: 14,
                            }}
                          />
                        </label>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                          Date of photo (approx) (optional)
                          <input
                            type="date"
                            value={photo.eventDate}
                            onChange={(e) => updatePendingPhoto(photo.id, { eventDate: e.target.value })}
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: 6,
                              boxSizing: "border-box",
                              borderRadius: 10,
                              border: `1px solid ${t.border}`,
                              background: t.surface,
                              color: t.text,
                              padding: "8px 10px",
                              fontSize: 14,
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {itemType === "document" && (
              <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Choose file
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ display: "block", marginTop: 6, fontSize: 13, color: t.text }}
                />
              </label>
            )}

            {itemType === "article" && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                  Website
                  <input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://…"
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 6,
                      boxSizing: "border-box",
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.surfaceHover,
                      color: t.text,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void fetchArticlePreview()}
                  disabled={fetchingOg || !externalUrl.trim()}
                  style={{
                    marginTop: 8,
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 12,
                    padding: "6px 12px",
                    cursor: fetchingOg ? "not-allowed" : "pointer",
                  }}
                >
                  {fetchingOg ? "Loading preview…" : "Load link preview"}
                </button>
                {articleThumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={articleThumb}
                    alt=""
                    style={{ marginTop: 10, maxWidth: "100%", borderRadius: 10, border: `1px solid ${t.border}` }}
                  />
                )}
              </div>
            )}

            {itemType === "memory" && (
              <label style={{ display: "block", marginTop: 14, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Your memory or story
                <textarea
                  value={memoryBody}
                  onChange={(e) => setMemoryBody(e.target.value)}
                  rows={5}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: 10,
                    fontSize: 14,
                    resize: "vertical",
                  }}
                />
              </label>
            )}

            {(itemType === "document" || itemType === "article") && (
              <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Caption / context (optional)
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: "10px 12px",
                    fontSize: 14,
                  }}
                />
              </label>
            )}

            {itemType === "memory" && (
              <label style={{ display: "block", marginTop: 12, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                Caption / context (optional)
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    padding: "10px 12px",
                    fontSize: 14,
                  }}
                />
              </label>
            )}

            {(itemType !== "photo" || photoStep === "caption") && (
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginTop: 16,
                fontSize: 13,
                cursor: "pointer",
                color: t.text,
              }}
            >
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                I confirm this content is respectful, relevant, and appropriate for this {subjectLabel}
                {itemType === "photo" && pendingPhotos.length > 1 ? " (all selected photos)" : ""}.
              </span>
            </label>
            )}

            {error && <div style={{ marginTop: 10, fontSize: 13, color: "#f87171", fontWeight: 600 }}>{error}</div>}

            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {itemType === "photo" && photoStep === "caption" ? (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoStep("pick");
                    setError(null);
                  }}
                  disabled={submitting}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "8px 14px",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => close()}
                  disabled={submitting}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.surfaceHover,
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "8px 14px",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
              )}
              {itemType === "photo" && photoStep === "pick" ? (
                <button
                  type="button"
                  disabled={pendingPhotos.length === 0}
                  onClick={() => {
                    setPhotoStep("caption");
                    setError(null);
                  }}
                  style={{
                    borderRadius: 10,
                    border: "none",
                    background: accentColor,
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "8px 14px",
                    cursor: pendingPhotos.length === 0 ? "not-allowed" : "pointer",
                    opacity: pendingPhotos.length === 0 ? 0.65 : 1,
                  }}
                >
                  Continue to captions
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submit()}
                  style={{
                    borderRadius: 10,
                    border: "none",
                    background: accentColor,
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "8px 14px",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.8 : 1,
                  }}
                >
                  {submitting
                    ? "Submitting…"
                    : itemType === "photo" && pendingPhotos.length > 1
                      ? `Publish ${pendingPhotos.length} photos`
                      : "Submit"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
