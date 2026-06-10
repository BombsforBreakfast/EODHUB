"use client";

import { useEffect, useState } from "react";
import { OgCard } from "./master/masterShared";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import PostAsSelector from "./PostAsSelector";
import { usePostAsIdentity } from "../hooks/usePostAsIdentity";

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

export type SharePostAsContext = {
  userEmail: string | null;
  selfLabel: string;
  selfPhotoUrl: string | null;
};

type Props = {
  listing: ShareListingPreview | null;
  label: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (content: string, postAsUserId: string | null) => void;
  postAsContext?: SharePostAsContext | null;
};

export default function ShareListingToFeedModal({
  listing,
  label,
  submitting,
  onClose,
  onSubmit,
  postAsContext = null,
}: Props) {
  const { t } = useTheme();
  const [content, setContent] = useState("");
  const postAs = usePostAsIdentity(supabase, {
    userEmail: postAsContext?.userEmail ?? null,
    selfLabel: postAsContext?.selfLabel ?? "You",
    selfPhotoUrl: postAsContext?.selfPhotoUrl ?? null,
    enabled: Boolean(postAsContext),
  });

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
              Add your own text, then post this {label.toLowerCase()} as a normal feed post.
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
            if (!submitting) {
              onSubmit(content, postAsContext ? postAs.postAsUserIdForSubmit : null);
            }
          }}
          style={{ padding: 16 }}
        >
          {postAsContext && postAs.showPostAsSelector ? (
            <PostAsSelector
              mode={postAs.postAsMode}
              onChange={postAs.setPostAsMode}
              selfLabel={postAs.selfLabel}
              selfPhotoUrl={postAs.selfPhotoUrl}
              adminLabel="EOD HUB Admin"
              adminPhotoUrl={postAs.postAsAdminProfile?.photoUrl ?? null}
              disabled={submitting}
            />
          ) : null}
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
