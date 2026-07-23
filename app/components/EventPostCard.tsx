"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import { FEED_MEDIA_RADIUS, FEED_SECTION_GAP } from "../lib/feedLayout";
import { ExternalSiteEmbedModal } from "./ExternalSiteEmbedModal";
import ExpandableText from "./ExpandableText";

type FeedEventSnapshot = {
  id: string;
  title: string;
  date: string;
  description: string | null;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
};

type EventPostCardProps = {
  event: FeedEventSnapshot;
  onOpen: (eventId: string) => void;
  maxWidth?: number | string;
};

type UrlPreview = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
};

const previewCache = new Map<string, UrlPreview | null>();

function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

function formatEventDisplayDate(dateIso: string | null | undefined): string | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventPostCard({ event, onOpen, maxWidth = 720 }: EventPostCardProps) {
  const { t, isDark } = useTheme();
  const eventDate = formatEventDisplayDate(event.date) ?? event.date;
  const imageSrc = httpsAssetUrl(event.image_url);
  const detailsHref = httpsAssetUrl(event.signup_url);
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [websiteModalOpen, setWebsiteModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      if (imageSrc || !detailsHref) {
        setPreview(null);
        return;
      }
      if (previewCache.has(detailsHref)) {
        setPreview(previewCache.get(detailsHref) ?? null);
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/preview-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ url: detailsHref }),
        });
        const json = (await res.json().catch(() => null)) as UrlPreview | { error?: string } | null;
        if (!res.ok || !json || !("url" in json)) {
          previewCache.set(detailsHref, null);
          if (!cancelled) setPreview(null);
          return;
        }
        previewCache.set(detailsHref, json);
        if (!cancelled) setPreview(json);
      } catch {
        previewCache.set(detailsHref, null);
        if (!cancelled) setPreview(null);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [detailsHref, imageSrc]);

  const visualImageSrc = useMemo(
    () => imageSrc || httpsAssetUrl(preview?.image),
    [imageSrc, preview?.image]
  );
  const visualTitle = useMemo(
    () => event.title || preview?.title || "Untitled Event",
    [event.title, preview?.title]
  );
  const visualHref = detailsHref || "";
  const visualIsUrlPreview = !imageSrc && Boolean(preview?.image && visualHref);

  return (
    <div
      style={{
        marginTop: FEED_SECTION_GAP,
        width: "100%",
        maxWidth,
        marginLeft: "auto",
        marginRight: "auto",
        borderRadius: FEED_MEDIA_RADIUS,
        border: `1px solid ${t.borderLight}`,
        background: isDark ? "rgba(255,255,255,0.02)" : t.bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          borderBottom: `1px solid ${t.borderLight}`,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.8,
          color: t.textMuted,
        }}
      >
        EVENT
      </div>

      {visualImageSrc ? (
        <button
          type="button"
          onClick={() => {
            if (visualIsUrlPreview) {
              setWebsiteModalOpen(true);
              return;
            }
            onOpen(event.id);
          }}
          aria-label={
            visualIsUrlPreview
              ? `Open website preview for ${visualTitle}`
              : `Open event details for ${visualTitle}`
          }
          style={{
            border: "none",
            width: "100%",
            padding: 0,
            margin: 0,
            cursor: "pointer",
            background: "transparent",
            display: "block",
            position: "relative",
            aspectRatio: "16 / 9",
          }}
        >
          <img
            src={visualImageSrc}
            alt={visualTitle}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "34px 14px 12px",
              background: "linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0))",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: "clamp(16px, 2.3vw, 22px)", fontWeight: 900, lineHeight: 1.18, color: "#fff" }}>
              {visualTitle}
            </div>
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(event.id)}
          aria-label={`Open event details for ${event.title}`}
          style={{
            border: "none",
            width: "100%",
            margin: 0,
            padding: "14px 14px 12px",
            cursor: "pointer",
            background: isDark ? "rgba(255,255,255,0.03)" : t.surface,
            textAlign: "left",
            display: "block",
          }}
        >
          <div style={{ fontSize: "clamp(17px, 2.1vw, 22px)", fontWeight: 900, lineHeight: 1.2, color: t.text }}>
            {visualTitle}
          </div>
        </button>
      )}

      <div style={{ padding: "10px 12px 12px", display: "grid", gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{eventDate}</div>
        {event.event_time ? <div style={{ fontSize: 14, color: t.text }}>{event.event_time}</div> : null}
        {(event.location || event.organization) ? (
          <div style={{ fontSize: 14, color: t.text }}>{event.location ?? event.organization}</div>
        ) : null}
        {event.description ? (
          <ExpandableText
            textLength={event.description.length}
            maxLines={5}
            minCharsToToggle={160}
            expandLabel="...show more"
            collapseLabel="Show less"
            toggleColor={t.textMuted}
            style={{ fontSize: 14, color: t.textMuted }}
          >
            {event.description}
          </ExpandableText>
        ) : null}
        {detailsHref ? (
          <div style={{ marginTop: 2 }}>
            <button
              type="button"
              onClick={() => setWebsiteModalOpen(true)}
              style={{
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
                color: isDark ? "#93c5fd" : "#1d4ed8",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Website
            </button>
          </div>
        ) : null}
      </div>
      <ExternalSiteEmbedModal
        open={websiteModalOpen && Boolean(detailsHref)}
        url={detailsHref}
        onClose={() => setWebsiteModalOpen(false)}
        title="Event website"
      />
    </div>
  );
}
