"use client";

import { ArrowRight } from "lucide-react";
import { useTheme } from "@/app/lib/ThemeContext";
import { PLANK_HOLDER_CAP, type PlankHolderResponse } from "@/app/lib/plankHolderChallengeClient";

type Props = {
  challenge: PlankHolderResponse | null;
  onViewChallenge: () => void;
  profileHref: string;
};

export function PlankHolderFeedBanner({ challenge, onViewChallenge, profileHref }: Props) {
  const { isDark } = useTheme();
  if (!challenge || !challenge.eligible) return null;

  const lowRemaining = !challenge.awarded && challenge.remainingSpots > 0 && challenge.remainingSpots <= 10;
  const closedBeforeEarned = challenge.alreadyClosed && !challenge.awarded;
  const border = lowRemaining ? "#f59e0b" : isDark ? "rgba(34,211,238,0.35)" : "rgba(14,116,144,0.25)";
  const bg = isDark ? "rgba(8,47,73,0.96)" : "#ecfeff";
  const primary = lowRemaining ? "#b45309" : isDark ? "#67e8f9" : "#155e75";
  const secondary = lowRemaining ? "#92400e" : isDark ? "#a5f3fc" : "#0e7490";

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
            {challenge.awarded ? `⚓ PLANK HOLDER #${challenge.plankHolderNumber}` : "⚓ PLANK HOLDER CHALLENGE"}
          </div>
          <div style={{ color: secondary, fontSize: 13, marginTop: 2, lineHeight: 1.35 }}>
            {challenge.awarded
              ? `Founding status secured. ${challenge.claimedCount} / ${PLANK_HOLDER_CAP} claimed.`
              : closedBeforeEarned
                ? "All 50 Plank Holder badges have been claimed."
                : lowRemaining
                  ? `Only ${challenge.remainingSpots} founding spots remain. Your Progress: ${challenge.progress.completedCount} / 5.`
                  : `Complete 5 founding actions to earn permanent founding status. Your Progress: ${challenge.progress.completedCount} / 5.`}
          </div>
        </div>
        {challenge.awarded ? (
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
        ) : (
          !closedBeforeEarned && (
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
          )
        )}
      </div>
    </div>
  );
}
