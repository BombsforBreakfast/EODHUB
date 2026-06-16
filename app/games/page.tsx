"use client";

import { useEffect, useMemo, useState } from "react";
import { BombSuitManAvatar } from "@/app/components/games/bomb-suit-man/BombSuitManAvatar";
import { ArcadeHighScoresSummary, buildArcadeHighScoreRows } from "@/app/components/games/ArcadeHighScoresSummary";
import { ArcadeSessionBar } from "@/app/components/games/ArcadeSessionBar";
import { useArcadeSession } from "@/app/components/games/useArcadeSession";
import { loadRainbowCowboyArcadeData } from "@/app/components/games/rainbow-cowboy/rainbowCowboyStorage";
import { getRainbowCowboyLevels } from "@/app/components/games/rainbow-cowboy/rainbowCowboyLevels";
import type { RainbowCowboyPersonalBest } from "@/app/components/games/rainbow-cowboy/rainbowCowboyTypes";
import { loadRenderSafePersonalBests } from "@/app/components/render-safe/renderSafeStorage";
import { getRenderSafeLevels } from "@/app/components/render-safe/renderSafeLevels";
import { useTheme } from "@/app/lib/ThemeContext";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";
import { RequireArcadePreview } from "@/app/components/games/RequireArcadePreview";

const GAMES = [
  {
    title: "Render Safe",
    subtitle: "Top-down night raid — get the assault force to the target.",
    href: "/render-safe",
    emoji: "💣",
    accent: "#f97316",
  },
  {
    title: "Bomb Suit Man",
    subtitle: "Bomb suit operator on a robot — or a pink unicorn. Eat drones. Make poor life choices.",
    footnote: "Game may or may not be inspired by an Army EOD senior leader.",
    href: "/games/bomb-suit-man",
    emoji: "🤖",
    accent: "#c9a227",
  },
] as const;

function GamesHubContent() {
  const { t } = useTheme();
  const { userId, profile, wallet, walletLoading } = useArcadeSession();
  const [renderSafeBests, setRenderSafeBests] = useState<Record<string, number | null>>({});
  const [rainbowBests, setRainbowBests] = useState<Record<string, RainbowCowboyPersonalBest | null>>({});

  const renderSafeLevels = useMemo(() => getRenderSafeLevels(), []);
  const rainbowLevels = useMemo(() => getRainbowCowboyLevels(), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadRenderSafePersonalBests(userId),
      loadRainbowCowboyArcadeData(userId),
    ]).then(([renderSafeRows, rainbowData]) => {
      if (cancelled) return;
      const renderSafeScores: Record<string, number | null> = {};
      for (const level of renderSafeLevels) {
        renderSafeScores[level.id] = renderSafeRows[level.id]?.score ?? null;
      }
      setRenderSafeBests(renderSafeScores);
      setRainbowBests(rainbowData.personalBests);
    });
    return () => {
      cancelled = true;
    };
  }, [renderSafeLevels, userId]);

  const highScoreRows = useMemo(
    () =>
      buildArcadeHighScoreRows({
        renderSafe: renderSafeBests,
        renderSafeLevelTitles: Object.fromEntries(renderSafeLevels.map((level) => [level.id, level.title])),
        rainbowCowboy: rainbowBests,
        rainbowCowboyLevelTitles: Object.fromEntries(rainbowLevels.map((level) => [level.id, level.title])),
      }),
    [rainbowBests, rainbowLevels, renderSafeBests, renderSafeLevels],
  );

  return (
    <div style={{ padding: "16px 12px 48px", maxWidth: 720, margin: "0 auto" }}>
      <ArcadeSessionBar profile={profile} wallet={wallet} walletLoading={walletLoading} />
      <ArcadeHighScoresSummary rows={highScoreRows} />

      <div
        style={{
          textAlign: "center",
          marginBottom: 28,
          padding: "20px 16px",
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>🕹️</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 800 }}>EOD-HUB Arcade</h1>
        <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
          Fictional community games — not real EOD training. You get 10 challenge coins each day; each play costs 1. Beat the global high score on a level to earn one back.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {GAMES.map((game) => (
          <a
            key={game.href}
            href={game.href}
            style={{
              display: "block",
              textDecoration: "none",
              padding: 18,
              borderRadius: 14,
              border: `2px solid ${game.accent}44`,
              background: t.surface,
              color: t.text,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {game.title === "Bomb Suit Man" ? (
                <BombSuitManAvatar size={44} />
              ) : (
                <span style={{ fontSize: 32 }}>{game.emoji}</span>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: game.accent }}>{game.title}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>{game.subtitle}</div>
                {"footnote" in game && game.footnote ? (
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, opacity: 0.9 }}>
                    {game.footnote}
                  </div>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function GamesHubPage() {
  return (
    <RequireFullAccess route="app/games/page.tsx">
      <RequireArcadePreview>
        <GamesHubContent />
      </RequireArcadePreview>
    </RequireFullAccess>
  );
}
