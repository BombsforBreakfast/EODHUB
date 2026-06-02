"use client";

import { ArrowRight, X } from "lucide-react";
import { useTheme } from "@/app/lib/ThemeContext";
import { PLANK_HOLDER_CAP, shouldShowPlankHolderFeedBanner, type PlankHolderResponse } from "@/app/lib/plankHolderChallengeClient";

type Props = {
  challenge: PlankHolderResponse | null;
  onViewChallenge: () => void;
  profileHref: string;
  earnedBannerDismissed?: boolean;
  onDismissEarnedBanner?: () => void;
};

export function PlankHolderFeedBanner({
  challenge,
  onViewChallenge,
  profileHref,
  earnedBannerDismissed,
  onDismissEarnedBanner,
}: Props) {
  const { isDark } = useTheme();
  if (!shouldShowPlankHolderFeedBanner(challenge, earnedBannerDismissed)) return null;

  const lowRemaining = !challenge!.awarded && challenge!.remainingSpots > 0 && challenge!.remainingSpots <= 10;
  const border = lowRemaining ? "#f59e0b" : isDark ? "rgba(34,211,238,0.35)" : "rgba(14,116,144,0.25)";
  const bg = isDark ? "rgba(8,47,73,0.96)" : "#ecfeff";
  const primary = lowRemaining ? "#b45309" : isDark ? "#67e8f9" : "#155e75";
  const secondary = lowRemaining ? "#92400e" : isDark ? "#a5f3fc" : "#0e7490";
  const challengeState = challenge!;

  return (
    <div
      className="plank-holder-banner"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        marginBottom: 12,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: "12px 14px",
        background: bg,
        boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.24)" : "0 10px 28px rgba(15,23,42,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: primary, fontSize: 13, fontWeight: 950, letterSpacing: 0.4 }}>
            {challengeState.awarded ? `⚓ PLANK HOLDER #${challengeState.plankHolderNumber}` : "⚓ PLANK HOLDER CHALLENGE"}
          </div>
          <div style={{ color: secondary, fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>
            {challengeState.awarded
              ? `Founding status secured. ${challengeState.claimedCount} / ${PLANK_HOLDER_CAP} claimed.`
              : lowRemaining
                ? `Only ${challengeState.remainingSpots} founding spots remain. Your Progress: ${challengeState.progress.completedCount} / 5.`
                : `Complete 5 founding actions to earn permanent founding status. Your Progress: ${challengeState.progress.completedCount} / 5.`}
          </div>
        </div>
        {challengeState.awarded ? (
          <>
            <a
              href={profileHref}
              style={{
                borderRadius: 11,
                background: "#0f172a",
                color: "white",
                padding: "8px 12px",
                fontWeight: 900,
                fontSize: 13,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              View Profile
            </a>
            {onDismissEarnedBanner && (
              <button
                type="button"
                onClick={onDismissEarnedBanner}
                aria-label="Dismiss Plank Holder banner"
                title="Dismiss"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "transparent",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(14,116,144,0.22)"}`,
                  color: isDark ? "#a5f3fc" : "#0e7490",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onViewChallenge}
            style={{
                border: "none",
                borderRadius: 11,
                background: "#0f172a",
                color: "white",
                padding: "8px 12px",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
            Continue Challenge
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
