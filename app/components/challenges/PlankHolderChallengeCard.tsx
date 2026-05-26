"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ArrowRight, Info } from "lucide-react";
import { useTheme } from "@/app/lib/ThemeContext";
import {
  getNextIncompleteTask,
  getTaskCtaHref,
  PLANK_HOLDER_CAP,
  PLANK_HOLDER_TASK_HINTS,
  PLANK_HOLDER_TASK_LABELS,
  PLANK_HOLDER_TASK_ORDER,
  type PlankHolderResponse,
} from "@/app/lib/plankHolderChallengeClient";

type Props = {
  challenge: PlankHolderResponse | null;
  userId: string | null;
  onCtaClick?: (href: string) => void;
  hidden?: boolean;
  onHide?: () => void;
};

export function PlankHolderChallengeCard({ challenge, userId, onCtaClick, hidden, onHide }: Props) {
  const { t, isDark } = useTheme();
  const [contributionHintOpen, setContributionHintOpen] = useState(false);

  if (!challenge || !challenge.eligible) return null;
  if (hidden && !challenge.awarded) return null;

  const nextTask = getNextIncompleteTask(challenge.progress);
  const ctaHref = getTaskCtaHref(nextTask, userId);
  const lowRemaining = !challenge.awarded && challenge.remainingSpots > 0 && challenge.remainingSpots <= 10;
  const closedBeforeEarned = challenge.alreadyClosed && !challenge.awarded;

  if (challenge.awarded) {
    return (
      <section
        id="plank-holder-challenge"
        style={{
          marginBottom: 12,
          border: `1px solid ${isDark ? "rgba(34,211,238,0.35)" : "rgba(14,116,144,0.25)"}`,
          borderRadius: 16,
          padding: 16,
          background: isDark ? "rgba(8,47,73,0.55)" : "#ecfeff",
          color: t.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 16, fontWeight: 950, color: isDark ? "#67e8f9" : "#155e75" }}>
              ⚓ Plank Holder #{challenge.plankHolderNumber}
            </div>
            <div style={{ fontSize: 13, color: isDark ? "#a5f3fc" : "#0e7490", marginTop: 2 }}>
              Founding status secured. {challenge.claimedCount} / {PLANK_HOLDER_CAP} claimed.
            </div>
          </div>
          <a
            href={userId ? `/profile/${userId}` : "/profile"}
            style={{
              borderRadius: 12,
              background: "#0f172a",
              color: "white",
              padding: "9px 14px",
              fontWeight: 900,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            View Profile
          </a>
        </div>
      </section>
    );
  }

  return (
    <section
      id="plank-holder-challenge"
      style={{
        marginBottom: 12,
        border: `1px solid ${lowRemaining ? "#f59e0b" : isDark ? "rgba(34,211,238,0.35)" : "rgba(14,116,144,0.25)"}`,
        borderRadius: 16,
        padding: 16,
        background: isDark ? "#082f49" : "#ecfeff",
        color: t.text,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 17, fontWeight: 950, color: isDark ? "#67e8f9" : "#155e75" }}>
            ⚓ Plank Holder Challenge
          </div>
          <div style={{ fontSize: 13, color: isDark ? "#a5f3fc" : "#0e7490", marginTop: 4, lineHeight: 1.45 }}>
            First 50 members to complete all 5 objectives earn permanent Plank Holder status.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div
            style={{
              borderRadius: 999,
              background: isDark ? "rgba(255,255,255,0.08)" : "white",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(14,116,144,0.18)"}`,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 950,
              color: lowRemaining ? "#b45309" : isDark ? "#67e8f9" : "#155e75",
              whiteSpace: "nowrap",
            }}
          >
            {challenge.claimedCount} / {PLANK_HOLDER_CAP} claimed
          </div>
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide challenge card for this session"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                background: "transparent",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(14,116,144,0.22)"}`,
                color: isDark ? "#a5f3fc" : "#0e7490",
                cursor: "pointer",
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              hide
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 14, fontWeight: 900 }}>
        {closedBeforeEarned ? "All 50 Plank Holder badges have been claimed." : `${challenge.progress.completedCount} / 5 Complete`}
      </div>
      {lowRemaining && (
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 900, color: "#b45309" }}>
          Only {challenge.remainingSpots} founding spots remain.
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {PLANK_HOLDER_TASK_ORDER.map((task) => {
          const done = challenge.progress[task];
          const isNext = task === nextTask;
          const hasHelper = task === "contribution";
          const helperOpen = hasHelper && (contributionHintOpen || (!done && isNext));
          return (
            <div
              key={task}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                color: done ? (isDark ? "#a7f3d0" : "#047857") : t.textMuted,
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              </span>
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: done ? 850 : isNext ? 850 : 650 }}>
                    {PLANK_HOLDER_TASK_LABELS[task]}
                  </span>
                  {hasHelper && (
                    <button
                      type="button"
                      onClick={() => setContributionHintOpen((open) => !open)}
                      aria-label="What counts as a contribution?"
                      aria-expanded={helperOpen}
                      title="What counts as a contribution?"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        padding: 0,
                        borderRadius: 999,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: isDark ? "#67e8f9" : "#0e7490",
                      }}
                    >
                      <Info size={14} />
                    </button>
                  )}
                </div>
                {hasHelper && helperOpen && PLANK_HOLDER_TASK_HINTS[task] && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                    {PLANK_HOLDER_TASK_HINTS[task]}
                  </span>
                )}
                {!hasHelper && !done && isNext && PLANK_HOLDER_TASK_HINTS[task] && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                    {PLANK_HOLDER_TASK_HINTS[task]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!closedBeforeEarned && (
        <a
          href={ctaHref}
          onClick={(event) => {
            event.preventDefault();
            onCtaClick?.(ctaHref);
          }}
          style={{
            marginTop: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            borderRadius: 12,
            background: "#0f172a",
            color: "white",
            padding: "9px 14px",
            fontWeight: 900,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Complete Next Task
          <ArrowRight size={15} />
        </a>
      )}
    </section>
  );
}
