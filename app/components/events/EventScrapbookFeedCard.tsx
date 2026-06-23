"use client";

import dynamic from "next/dynamic";
import type { MemorialScrapbookTheme } from "../memorial/scrapbook/types";

const MemorialScrapbookPreview = dynamic(
  () => import("../memorial/scrapbook").then((m) => m.MemorialScrapbookPreview),
  { ssr: false },
);

type FeedEventSnapshot = {
  id: string;
  title: string;
  date: string;
  location: string | null;
  image_url: string | null;
};

type Props = {
  event: FeedEventSnapshot;
  onOpen: (eventId: string) => void;
  t: MemorialScrapbookTheme;
  isMobile?: boolean;
  isDark?: boolean;
  maxWidth?: number | string;
  accentColor?: string;
  scrapbookActorUserId?: string | null;
  scrapbookActorIsAdmin?: boolean;
};

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

export default function EventScrapbookFeedCard({
  event,
  onOpen,
  t,
  isMobile,
  isDark,
  maxWidth = 720,
  accentColor,
  scrapbookActorUserId,
  scrapbookActorIsAdmin,
}: Props) {
  const imageSrc = httpsAssetUrl(event.image_url);
  const scrapbookAccent = accentColor ?? (isDark ? "#a78bfa" : "#7c3aed");
  const eventDate = formatEventDisplayDate(event.date) ?? event.date;

  return (
    <div
      style={{
        marginTop: 12,
        width: "100%",
        maxWidth,
        marginLeft: "auto",
        marginRight: "auto",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.surface,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {imageSrc ? (
        <button
          type="button"
          onClick={() => onOpen(event.id)}
          aria-label={`Open event details for ${event.title}`}
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
            src={imageSrc}
            alt={event.title}
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
              {event.title}
            </div>
          </div>
        </button>
      ) : null}

      <div style={{ padding: isMobile ? "12px 14px" : "14px 16px", boxSizing: "border-box" }}>
        <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, letterSpacing: 0.8, color: t.textMuted }}>
          MEMORIES
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: isMobile ? 17 : 20,
            fontWeight: 900,
            color: t.text,
            lineHeight: 1.25,
            wordBreak: "break-word",
          }}
        >
          {imageSrc ? "Share your photos and memories" : `Share memories from ${event.title}`}
        </div>
        <div style={{ marginTop: 8, fontSize: isMobile ? 12 : 13, color: t.textMuted, lineHeight: 1.4 }}>
          {eventDate}
          {event.location ? ` · ${event.location}` : ""}
        </div>

        <MemorialScrapbookPreview
          targetId={event.id}
          subjectType="event"
          t={t}
          accentColor={scrapbookAccent}
          variant="feedStrip"
          isMobile={isMobile}
          panelBackground={t.surface}
          scrapbookActorUserId={scrapbookActorUserId}
          scrapbookActorIsAdmin={scrapbookActorIsAdmin}
        />

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => onOpen(event.id)}
            style={{
              border: "none",
              borderRadius: 10,
              padding: isMobile ? "12px 16px" : "8px 14px",
              width: isMobile ? "100%" : "auto",
              minHeight: isMobile ? 44 : undefined,
              boxSizing: "border-box",
              background: t.text,
              color: t.surface,
              fontWeight: 800,
              fontSize: isMobile ? 15 : undefined,
              cursor: "pointer",
            }}
          >
            Open Scrapbook
          </button>
        </div>
      </div>
    </div>
  );
}
