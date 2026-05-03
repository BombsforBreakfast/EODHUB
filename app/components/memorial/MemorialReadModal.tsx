"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { ServiceSealValue } from "@/app/lib/serviceSeals";
import { MemorialScrapbookPreview } from "./scrapbook";
import type { Memorial } from "./memorialModalShared";
import { MemorialDisclaimer } from "./MemorialDisclaimer";
import { memorialTheme } from "./memorialModalShared";

type Props = {
  memorial: Memorial;
  onClose: () => void;
  isMobile: boolean;
  /** Events calendar modal uses 1000; global nav layer should sit above nav chrome. */
  zIndex?: number;
  /** From parent (single auth load) so scrapbook previews do not each call `getUser()`. */
  scrapbookActorUserId?: string | null;
  scrapbookActorIsAdmin?: boolean;
};

export function MemorialReadModal({
  memorial,
  onClose,
  isMobile,
  zIndex = 1000,
  scrapbookActorUserId = null,
  scrapbookActorIsAdmin = false,
}: Props) {
  const { t, isDark } = useTheme();
  const theme = memorialTheme(memorial.category, memorial.service);
  const currentYear = new Date().getFullYear();

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        padding: isMobile ? "92px 14px 18px" : 20,
        zIndex,
        boxSizing: "border-box",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: isMobile ? "calc(100dvh - 110px)" : "calc(100vh - 40px)",
          background: t.surface,
          color: t.text,
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "22px 24px 10px" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
            {memorial.photo_url && (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                  border: `3px solid ${theme.outlineColor}`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={memorial.photo_url}
                  alt={memorial.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            )}
              <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: theme.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                  {theme.label}
                </div>
                {memorial.category !== "leo_fed" && memorial.service?.trim() ? (
                  <ServiceSealValue service={memorial.service} size={28} />
                ) : null}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2, lineHeight: 1.2 }}>
                {memorial.name}
              </div>
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
                {new Date(`${memorial.death_date}T12:00:00`).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                {" · "}
                {currentYear - parseInt(memorial.death_date.split("-")[0], 10)} years ago
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: `1px solid ${t.border}`,
              background: t.surface,
              color: t.text,
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>

        <div style={{ padding: "6px 24px 4px", overflowY: "auto", flex: 1, minHeight: 0 }}>
          {memorial.bio ? (
            <div style={{ lineHeight: 1.65, color: t.text, fontSize: 14, whiteSpace: "pre-wrap" }}>{memorial.bio}</div>
          ) : (
            <div style={{ color: t.textFaint, fontSize: 14 }}>No biography on file.</div>
          )}
          <MemorialScrapbookPreview
            memorialId={memorial.id}
            t={t}
            accentColor={theme.color}
            isMobile={isMobile}
            panelBackground={isDark ? theme.darkCommentBg : theme.lightCommentBg}
            scrapbookActorUserId={scrapbookActorUserId}
            scrapbookActorIsAdmin={scrapbookActorIsAdmin}
          />
          <div style={{ marginTop: 16, fontSize: 11, lineHeight: 1.5, color: t.textFaint, fontStyle: "italic" }}>
            <MemorialDisclaimer category={memorial.category} sourceUrl={memorial.source_url} linkColor={theme.color} />
          </div>
        </div>
      </div>
    </div>
  );
}
