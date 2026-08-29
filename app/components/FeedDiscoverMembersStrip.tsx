"use client";

import type { DiscoverProfile } from "../lib/queries/discoverProfiles";
import { getServiceRingColor } from "../lib/serviceBranchVisual";

const DISCOVER_AVATAR_SIZE = 55;
const DISCOVER_CARD_WIDTH = 125;

type ThemeColors = {
  border: string;
  surface: string;
  text: string;
  textMuted: string;
  textFaint: string;
  badgeBg: string;
};

type Props = {
  t: ThemeColors;
  isMobile: boolean;
  profiles: DiscoverProfile[];
  pageIndex: number;
  maxPageIndex: number;
  knowToast: string | null;
  currentUserId: string | null;
  onPageChange: (next: number) => void;
  onToggleKnow: (userId: string) => void;
};

/** “Connect with Verified Members” — rendered mid-feed after recent posts. */
export default function FeedDiscoverMembersStrip({
  t,
  isMobile,
  profiles,
  pageIndex,
  maxPageIndex,
  knowToast,
  currentUserId,
  onPageChange,
  onToggleKnow,
}: Props) {
  if (profiles.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 16,
        marginBottom: 16,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: "14px 16px",
        background: t.surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          minHeight: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: t.textFaint,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          Connect with Verified Members
        </div>
        {knowToast ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.text,
              background: t.badgeBg,
              border: `1px solid ${t.border}`,
              borderRadius: 999,
              padding: "3px 10px",
              whiteSpace: "nowrap",
              maxWidth: "60%",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {knowToast}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!isMobile ? (
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
            disabled={pageIndex <= 0}
            title="Previous"
            aria-label="Previous suggestions"
            style={{
              flexShrink: 0,
              background: "none",
              border: `1px solid ${t.border}`,
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: pageIndex <= 0 ? "default" : "pointer",
              color: t.textMuted,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: pageIndex <= 0 ? 0.35 : 1,
            }}
          >
            {"<"}
          </button>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 16,
            overflowX: isMobile ? "auto" : "hidden",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 4,
            flex: 1,
            scrollSnapType: isMobile ? "x mandatory" : undefined,
          }}
        >
          {profiles.map((p) => {
            const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Member";
            const ringColor = getServiceRingColor(p.service, p.country);
            const isPendingKnow = p.knowStatus === "pending_outgoing";
            const isIncomingKnow = p.knowStatus === "pending_incoming";
            const affinityHint =
              p.affinityReasons[0] || (p.service ? `Service: ${p.service}` : "Community member");
            return (
              <div
                key={p.user_id}
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  width: DISCOVER_CARD_WIDTH,
                  scrollSnapAlign: isMobile ? "start" : undefined,
                }}
              >
                <a
                  href={`/profile/${p.user_id}`}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      width: DISCOVER_AVATAR_SIZE,
                      height: DISCOVER_AVATAR_SIZE,
                      borderRadius: "50%",
                      overflow: "hidden",
                      background: t.badgeBg,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      color: t.textMuted,
                      fontSize: 20,
                      boxSizing: "border-box",
                      border: ringColor ? `3px solid ${ringColor}` : `2px solid ${t.border}`,
                    }}
                  >
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photo_url}
                        alt={fullName}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      (fullName[0] || "U").toUpperCase()
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: t.text,
                      textAlign: "center",
                      lineHeight: 1.3,
                      wordBreak: "break-word",
                    }}
                  >
                    {fullName}
                  </div>
                  <div
                    title={affinityHint}
                    style={{
                      fontSize: 9,
                      color: t.textFaint,
                      textAlign: "center",
                      lineHeight: 1.2,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {affinityHint}
                  </div>
                </a>
                {currentUserId ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
                    <button
                      type="button"
                      onClick={() => onToggleKnow(p.user_id)}
                      disabled={isPendingKnow}
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "3px 5px",
                        borderRadius: 6,
                        border: "none",
                        cursor: isPendingKnow ? "default" : "pointer",
                        background: isPendingKnow ? t.text : isIncomingKnow ? "#1d4ed8" : t.badgeBg,
                        color: isPendingKnow || isIncomingKnow ? "#fff" : t.textMuted,
                        opacity: isPendingKnow ? 0.75 : 1,
                        width: "100%",
                      }}
                    >
                      {isPendingKnow ? "Request Sent" : isIncomingKnow ? "Know Back" : "Know"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {!isMobile ? (
          <button
            type="button"
            onClick={() => onPageChange(Math.min(maxPageIndex, pageIndex + 1))}
            disabled={pageIndex >= maxPageIndex}
            title="Next"
            aria-label="Next suggestions"
            style={{
              flexShrink: 0,
              background: "none",
              border: `1px solid ${t.border}`,
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: pageIndex >= maxPageIndex ? "default" : "pointer",
              color: t.textMuted,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: pageIndex >= maxPageIndex ? 0.35 : 1,
            }}
          >
            {">"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
