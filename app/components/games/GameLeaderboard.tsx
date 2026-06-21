"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { LikerAvatar } from "@/app/components/PostLikersStack";
import { formatGameDuration } from "./formatGameDuration";
import { fetchGameLeaderboard } from "./gameLeaderboardStorage";
import type { ArcadeGameId, GameLeaderboardEntry } from "./gameLeaderboardTypes";
import {
  formatDifficultyLabel,
  getDifficultyBadgeColor,
} from "./rainbow-cowboy/rainbowCowboyDifficulty";
import type { RainbowCowboyDifficulty } from "./rainbow-cowboy/rainbowCowboyTypes";

interface Props {
  game: ArcadeGameId;
  levelId: string;
  levelTitle: string;
  accentColor?: string;
  limit?: number;
  /** When provided, skips the internal Supabase fetch. */
  entries?: GameLeaderboardEntry[];
  loading?: boolean;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const label = formatDifficultyLabel(difficulty as RainbowCowboyDifficulty);
  const color = getDifficultyBadgeColor(difficulty);
  return (
    <span
      style={{
        display: "inline-block",
        marginTop: 3,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
      }}
    >
      {label}
    </span>
  );
}

/** Single top entry for inline level-card previews. */
export function GameLeaderboardTopPreview({
  entry,
  loading,
  accentColor = "#c9a227",
  emptyLabel = "No scores yet",
}: {
  entry?: GameLeaderboardEntry | null;
  loading?: boolean;
  accentColor?: string;
  emptyLabel?: string;
}) {
  const { t } = useTheme();

  if (loading) {
    return (
      <div style={{ fontSize: 11, color: t.textMuted, padding: "4px 0" }}>Loading…</div>
    );
  }

  if (!entry) {
    return (
      <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.45, padding: "4px 0" }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 8,
        background: `${accentColor}12`,
      }}
    >
      <div style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>{MEDALS[0]}</div>
      <Link
        href={`/profile/${entry.userId}`}
        style={{ textDecoration: "none", flexShrink: 0, lineHeight: 0 }}
        title={entry.displayName}
        onClick={(e) => e.stopPropagation()}
      >
        <LikerAvatar
          photoUrl={entry.photoUrl}
          name={entry.displayName}
          size={32}
          service={entry.service}
          isEmployer={entry.isEmployer}
        />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/profile/${entry.userId}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block",
            textDecoration: "none",
            color: t.text,
            fontWeight: 700,
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.displayName}
        </Link>
        {entry.rank && (
          <div
            style={{
              fontSize: 10,
              color: t.textMuted,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.rank}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: accentColor }}>{entry.score}</div>
        {entry.durationSeconds != null && (
          <div style={{ fontSize: 10, color: t.textMuted }}>
            {formatGameDuration(entry.durationSeconds)}
          </div>
        )}
        {entry.difficulty && (
          <div style={{ marginTop: 2 }}>
            <DifficultyBadge difficulty={entry.difficulty} />
          </div>
        )}
      </div>
    </div>
  );
}

export function GameLeaderboard({
  game,
  levelId,
  levelTitle,
  accentColor = "#ff60c0",
  limit = 10,
  entries: controlledEntries,
  loading: controlledLoading,
}: Props) {
  const { t } = useTheme();
  const [entries, setEntries] = useState<GameLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const usesControlledData = controlledLoading !== undefined;

  useEffect(() => {
    if (usesControlledData) return;

    let cancelled = false;
    setLoading(true);
    fetchGameLeaderboard(game, levelId, limit).then((rows) => {
      if (!cancelled) {
        setEntries(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [game, levelId, limit, usesControlledData]);

  const displayEntries = usesControlledData ? (controlledEntries ?? []) : entries;
  const displayLoading = usesControlledData ? !!controlledLoading : loading;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "14px 14px 12px",
        borderRadius: 12,
        border: `1px solid ${accentColor}44`,
        background: t.surface,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: accentColor,
          marginBottom: 10,
        }}
      >
        Leaderboard — {levelTitle}
      </div>

      {game === "rainbow_cowboy" && (
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10, lineHeight: 1.45 }}>
          Harder modes spawn more enemies — higher scores reflect the difficulty you cleared.
        </div>
      )}

      {displayLoading && (
        <div style={{ fontSize: 13, color: t.textMuted, padding: "8px 0" }}>Loading scores…</div>
      )}

      {!displayLoading && displayEntries.length === 0 && (
        <div style={{ fontSize: 13, color: t.textMuted, padding: "8px 0", lineHeight: 1.45 }}>
          No scores yet. Be the first to clear this level!
        </div>
      )}

      {!displayLoading && displayEntries.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {displayEntries.map((entry, index) => (
            <li
              key={entry.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 8px",
                borderRadius: 8,
                background: index < 3 ? `${accentColor}12` : t.bg,
              }}
            >
              <div
                style={{
                  width: 24,
                  textAlign: "center",
                  fontSize: index < 3 ? 16 : 12,
                  fontWeight: 800,
                  color: index < 3 ? accentColor : t.textMuted,
                  flexShrink: 0,
                }}
              >
                {index < 3 ? MEDALS[index] : index + 1}
              </div>

              <Link
                href={`/profile/${entry.userId}`}
                style={{ textDecoration: "none", flexShrink: 0, lineHeight: 0 }}
                title={entry.displayName}
              >
                <LikerAvatar
                  photoUrl={entry.photoUrl}
                  name={entry.displayName}
                  size={36}
                  service={entry.service}
                  isEmployer={entry.isEmployer}
                />
              </Link>

              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/profile/${entry.userId}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: t.text,
                    fontWeight: 700,
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.displayName}
                </Link>
                {entry.rank && (
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{entry.rank}</div>
                )}
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: accentColor }}>{entry.score}</div>
                {entry.durationSeconds != null && (
                  <div style={{ fontSize: 11, color: t.textMuted }}>
                    {formatGameDuration(entry.durationSeconds)}
                  </div>
                )}
                {entry.difficulty && (
                  <div style={{ marginTop: 2 }}>
                    <DifficultyBadge difficulty={entry.difficulty} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
