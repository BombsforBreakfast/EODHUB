"use client";

import { useEffect, useMemo, useState } from "react";
import { BombSuitManAvatar } from "@/app/components/games/bomb-suit-man/BombSuitManAvatar";
import { BSM_ACCENT, BSM_TITLE_GRADIENT } from "@/app/components/games/bomb-suit-man/bombSuitManTheme";
import { ArcadeHighScoresSummary, buildArcadeHighScoreRows } from "@/app/components/games/ArcadeHighScoresSummary";
import { ArcadeSessionBar } from "@/app/components/games/ArcadeSessionBar";
import { useArcadeSession } from "@/app/components/games/useArcadeSession";
import { loadRainbowCowboyArcadeData } from "@/app/components/games/rainbow-cowboy/rainbowCowboyStorage";
import { getRainbowCowboyLevels } from "@/app/components/games/rainbow-cowboy/rainbowCowboyLevels";
import type { RainbowCowboyPersonalBest } from "@/app/components/games/rainbow-cowboy/rainbowCowboyTypes";
import { useTheme } from "@/app/lib/ThemeContext";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";
import { RequireArcadePreview } from "@/app/components/games/RequireArcadePreview";

const FLAGSHIP_HREF = "/games/bomb-suit-man";

function GamesHubContent() {
  const { t } = useTheme();
  const { userId, profile, wallet, walletLoading } = useArcadeSession();
  const [rainbowBests, setRainbowBests] = useState<Record<string, RainbowCowboyPersonalBest | null>>({});

  const rainbowLevels = useMemo(() => getRainbowCowboyLevels(), []);

  useEffect(() => {
    let cancelled = false;
    void loadRainbowCowboyArcadeData(userId).then((rainbowData) => {
      if (cancelled) return;
      setRainbowBests(rainbowData.personalBests);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const highScoreRows = useMemo(
    () =>
      buildArcadeHighScoreRows({
        rainbowCowboy: rainbowBests,
        rainbowCowboyLevelTitles: Object.fromEntries(rainbowLevels.map((level) => [level.id, level.title])),
      }),
    [rainbowBests, rainbowLevels],
  );

  return (
    <div style={{ padding: "16px 12px 48px", maxWidth: 720, margin: "0 auto" }}>
      <ArcadeSessionBar profile={profile} wallet={wallet} walletLoading={walletLoading} />
      <ArcadeHighScoresSummary rows={highScoreRows} />

      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
          padding: "20px 16px",
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>🕹️</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 800 }}>EOD-HUB Arcade</h1>
        <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
          You get 10 challenge coins each day; each play costs 1. Beat the global high score on a level to earn one back.
        </p>
      </div>

      <a
        href={FLAGSHIP_HREF}
        style={{
          display: "block",
          textDecoration: "none",
          padding: "22px 20px",
          borderRadius: 18,
          border: `2px solid ${BSM_ACCENT}66`,
          background: `linear-gradient(165deg, ${t.surface} 0%, ${t.surfaceHover} 100%)`,
          color: t.text,
          boxShadow: `0 12px 36px ${BSM_ACCENT}22`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <BombSuitManAvatar size={72} />
          <div>
            <div
              style={{
                fontWeight: 900,
                fontSize: 28,
                background: BSM_TITLE_GRADIENT,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Bomb Suit Man
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: BSM_ACCENT, marginTop: 6, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Flagship game
            </div>
            <div style={{ fontSize: 14, color: t.textMuted, marginTop: 10, lineHeight: 1.5, maxWidth: 420 }}>
              Bomb suit operator on a robot — or a pink unicorn. Eat drones. Make poor life choices.
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 8, opacity: 0.9 }}>
              Unicorn option inspired by senior Army EOD leader.
            </div>
          </div>
          <div
            style={{
              marginTop: 4,
              borderRadius: 12,
              padding: "12px 22px",
              background: BSM_TITLE_GRADIENT,
              color: "#111",
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            Play now
          </div>
        </div>
      </a>
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
