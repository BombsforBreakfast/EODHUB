"use client";

import { useEffect, useRef, useState } from "react";
import PostAsSelector from "./PostAsSelector";
import { OgCard } from "./master/masterShared";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { isImageFile } from "../lib/uploadLimits";
import {
  adminPostDisplayName,
  canUsePostAsSelector,
  loadStoredListingSharePostAsMode,
  POST_AS_ADMIN_EMAIL,
  storeListingSharePostAsMode,
  type PostAsMode,
} from "../lib/postAsIdentity";

export type ShareListingPreview = {
  id: string;
  website_url: string | null;
  business_name?: string | null;
  custom_blurb?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_site_name?: string | null;
};

type Props = {
  listing: ShareListingPreview | null;
  label: string;
  submitting: boolean;
  allowPhotoAttachment?: boolean;
  onClose: () => void;
  onSubmit: (content: string, postAsMode?: PostAsMode, photoFile?: File | null) => void;
};

export default function ShareListingToFeedModal({
  listing,
  label,
  submitting,
  allowPhotoAttachment = false,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useTheme();
  const [content, setContent] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [postAsMode, setPostAsMode] = useState<PostAsMode>(() => loadStoredListingSharePostAsMode());
  const [canChoosePostAs, setCanChoosePostAs] = useState(false);
  const [selfLabel, setSelfLabel] = useState("You");
  const [selfPhotoUrl, setSelfPhotoUrl] = useState<string | null>(null);
  const [adminLabel, setAdminLabel] = useState("EOD HUB Admin");
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) return;
    setContent("");
    setPhotoFile(null);
    setPhotoError(null);
    setPostAsMode(loadStoredListingSharePostAsMode());
  }, [listing?.id]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!listing) return;
    let cancelled = false;

    async function loadPostAsOptions() {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;
      if (!authUser || cancelled) return;

      const viewerEmail = authUser.email?.trim().toLowerCase() ?? null;
      if (!canUsePostAsSelector(viewerEmail)) {
        if (!cancelled) setCanChoosePostAs(false);
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
          .select("display_name, first_name, last_name, photo_url")
          .ilike("email", POST_AS_ADMIN_EMAIL)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setCanChoosePostAs(Boolean(adminProfile));
      if (viewerProfile) {
        setSelfLabel(
          adminPostDisplayName(viewerProfile) || "You",
        );
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
  }, [listing?.id]);

  useEffect(() => {
    if (!listing) return;
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [listing, onClose, submitting]);

  if (!listing) return null;

  const title = listing.og_title || listing.business_name || listing.og_site_name || label;
  const description = listing.custom_blurb || listing.og_description || null;

  return (
    <div
      role="presentation"
      onClick={() => {
        if (!submitting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-listing-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "88vh",
          overflowY: "auto",
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div id="share-listing-title" style={{ fontSize: 18, fontWeight: 900 }}>
              Share to feed
            </div>
            <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>
              Add your own text{allowPhotoAttachment ? ", an optional photo/flyer," : ""} then post this {label.toLowerCase()} as a normal feed post.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close share composer"
            style={{ background: "none", border: "none", color: t.text, fontSize: 24, fontWeight: 800, cursor: submitting ? "default" : "pointer", lineHeight: 1 }}
          >
            x
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitting) onSubmit(content, canChoosePostAs ? postAsMode : undefined, photoFile);
          }}
          style={{ padding: 16 }}
        >
          {canChoosePostAs && (
            <PostAsSelector
              mode={postAsMode}
              onChange={(mode) => {
                setPostAsMode(mode);
                storeListingSharePostAsMode(mode);
              }}
              selfLabel={selfLabel}
              selfPhotoUrl={selfPhotoUrl}
              adminLabel={adminLabel}
              adminPhotoUrl={adminPhotoUrl}
              disabled={submitting}
            />
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 4000))}
            rows={5}
            autoFocus
            placeholder="What do you want to say about this?"
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 10,
              border: `1px solid ${t.inputBorder}`,
              background: t.input,
              color: t.text,
              padding: "10px 12px",
              fontFamily: "inherit",
              fontSize: 14,
              lineHeight: 1.45,
              resize: "vertical",
            }}
          />
          {allowPhotoAttachment && (
            <div style={{ marginTop: 10 }}>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  if (!file) return;
                  if (!isImageFile(file)) {
                    setPhotoError("Please choose a JPG, PNG, WEBP, or GIF image.");
                    return;
                  }
                  setPhotoError(null);
                  setPhotoFile(file);
                }}
              />
              {photoPreviewUrl ? (
                <div
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: t.bg,
                  }}
                >
                  <img
                    src={photoPreviewUrl}
                    alt="Flyer preview"
                    style={{ width: "100%", maxHeight: 280, objectFit: "contain", display: "block", background: "#111827" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 8 }}>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => photoInputRef.current?.click()}
                      style={{
                        background: "transparent",
                        color: t.text,
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontWeight: 700,
                        cursor: submitting ? "default" : "pointer",
                      }}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoError(null);
                      }}
                      style={{
                        background: "transparent",
                        color: t.textMuted,
                        border: "none",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontWeight: 700,
                        cursor: submitting ? "default" : "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: t.bg,
                    color: t.text,
                    border: `1px dashed ${t.border}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    fontWeight: 700,
                    cursor: submitting ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  Add photo / flyer (optional)
                </button>
              )}
              {photoError && (
                <div style={{ marginTop: 6, color: "#ef4444", fontSize: 12, fontWeight: 600 }}>
                  {photoError}
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <OgCard
              og={{
                url: listing.website_url ?? "",
                title,
                description,
                image: listing.og_image ?? null,
                siteName: listing.og_site_name ?? null,
              }}
            />
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                background: "transparent",
                color: t.text,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "9px 14px",
                fontWeight: 700,
                cursor: submitting ? "default" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: "#111",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "9px 16px",
                fontWeight: 800,
                cursor: submitting ? "wait" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
