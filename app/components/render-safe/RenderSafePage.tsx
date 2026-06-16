"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { GameLeaderboard } from "@/app/components/games/GameLeaderboard";
import { GameArcadeNav } from "@/app/components/games/GameArcadeNav";
import { ArcadeOutOfCoinsNotice } from "@/app/components/games/ArcadeOutOfCoinsNotice";
import { ArcadeSessionBar } from "@/app/components/games/ArcadeSessionBar";
import { useArcadeSession } from "@/app/components/games/useArcadeSession";
import { clearGameLeaderboardCache, fetchGameLeaderboard } from "@/app/components/games/gameLeaderboardStorage";
import type { GameLeaderboardEntry } from "@/app/components/games/gameLeaderboardTypes";
import { RenderSafeEndScreen } from "./RenderSafeEndScreen";
import { RenderSafeGame } from "./RenderSafeGame";
import { RenderSafeLevelSelect } from "./RenderSafeLevelSelect";
import { RenderSafeMissionBrief } from "./RenderSafeMissionBrief";
import { getRenderSafeLevelById, getNextPlayableLevel, getRenderSafeLevels } from "./renderSafeLevels";
import {
  getLocalPersonalBest,
  loadRenderSafePersonalBests,
  saveLocalPersonalBest,
  saveRenderSafePersonalBest,
} from "./renderSafeStorage";
import type { RenderSafeRunResult } from "./renderSafeTypes";

const DISCLAIMER =
  "Render Safe is a fictional arcade game for community engagement only. It does not teach or represent real EOD procedures.";

export function RenderSafePage() {
  const { t } = useTheme();
  const {
    userId,
    profile,
    wallet,
    walletLoading,
    coinError,
    setCoinError,
    refreshWallet,
    payToPlay,
  } = useArcadeSession();

  const levels = useMemo(() => getRenderSafeLevels(), []);
  const [screen, setScreen] = useState<"select" | "brief" | "playing" | "complete">("select");
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>("level-1");
  const [gameKey, setGameKey] = useState(0);
  const [personalBests, setPersonalBests] = useState<Record<string, number | null>>({});
  const [leaderboardEntries, setLeaderboardEntries] = useState<Record<string, GameLeaderboardEntry[]>>({});
  const [leaderboardsLoading, setLeaderboardsLoading] = useState(true);
  const [runResult, setRunResult] = useState<RenderSafeRunResult | null>(null);
  const [personalBestMessage, setPersonalBestMessage] = useState("");

  const selectedLevel = selectedLevelId ? getRenderSafeLevelById(selectedLevelId) : null;
  const isPlaying = screen === "playing";
  const isImmersive = isPlaying;

  const loadPersonalBests = useCallback(async () => {
    const rows = await loadRenderSafePersonalBests(userId);
    const next: Record<string, number | null> = {};
    for (const level of levels) {
      next[level.id] = rows[level.id]?.score ?? null;
    }
    setPersonalBests(next);
  }, [levels, userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadPersonalBests();
    });
    return () => {
      cancelled = true;
    };
  }, [loadPersonalBests]);

  useEffect(() => {
    let cancelled = false;
    const playableLevels = levels.filter((level) => !level.locked);
    void Promise.all(
      playableLevels.map(async (level) => {
        const entries = await fetchGameLeaderboard("render_safe", level.id, 10);
        return [level.id, entries] as const;
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, GameLeaderboardEntry[]> = {};
      for (const [levelId, entries] of rows) next[levelId] = entries;
      setLeaderboardEntries(next);
      setLeaderboardsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [levels]);

  useEffect(() => {
    if (!isPlaying) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isPlaying]);

  const playAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const fitPlayArea = () => {
      const el = playAreaRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      el.style.height = `${Math.max(320, window.innerHeight - top)}px`;
    };

    fitPlayArea();
    window.addEventListener("resize", fitPlayArea);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitPlayArea) : null;
    if (ro && playAreaRef.current?.parentElement) {
      ro.observe(playAreaRef.current.parentElement);
    }
    return () => {
      window.removeEventListener("resize", fitPlayArea);
      ro?.disconnect();
    };
  }, [isPlaying]);

  const handleSelectLevel = (levelId: string) => {
    setSelectedLevelId(levelId);
    setScreen("brief");
  };

  const handleStartMission = async () => {
    if (!selectedLevelId) return;
    const paid = await payToPlay("render_safe", selectedLevelId);
    if (!paid) return;
    setGameKey((k) => k + 1);
    setScreen("playing");
  };

  const handleComplete = async (result: RenderSafeRunResult) => {
    setRunResult(result);

    if (userId) {
      const saveResult = await saveRenderSafePersonalBest(result, userId);
      if (saveResult.saved) clearGameLeaderboardCache("render_safe");
      if (saveResult.coinGranted) {
        await refreshWallet(true);
      }
      if (saveResult.saved && saveResult.previousBest == null) {
        setPersonalBestMessage(
          saveResult.coinGranted
            ? "Personal Best Saved · +1 Challenge Coin — global high score!"
            : "Personal Best Saved",
        );
      } else if (saveResult.saved && saveResult.isNewBest) {
        setPersonalBestMessage(
          saveResult.coinGranted
            ? "New Personal Best! · +1 Challenge Coin — global high score!"
            : "New Personal Best!",
        );
      } else if (saveResult.previousBest != null) {
        setPersonalBestMessage(`Personal Best: ${saveResult.currentBest}`);
      } else {
        setPersonalBestMessage(`Run Score: ${result.score}`);
      }
    } else {
      saveLocalPersonalBest(result.levelId, result.score);
      const localBest = getLocalPersonalBest(result.levelId);
      if (localBest === result.score) {
        setPersonalBestMessage(`Local Best: ${result.score}`);
      } else {
        setPersonalBestMessage(`Run Score: ${result.score}`);
      }
    }

    setScreen("complete");
    loadPersonalBests();
  };

  const handleRestart = async () => {
    if (!runResult) return;
    const paid = await payToPlay("render_safe", runResult.levelId);
    if (!paid) return;
    setGameKey((k) => k + 1);
    setScreen("playing");
    setRunResult(null);
  };

  const handleExitGame = () => {
    setScreen("select");
    setRunResult(null);
  };

  const handleNextLevel = () => {
    if (!runResult) return;
    const next = getNextPlayableLevel(runResult.levelId);
    if (!next) return;
    setSelectedLevelId(next.id);
    setRunResult(null);
    setPersonalBestMessage("");
    setScreen("brief");
  };

  const nextLevel =
    screen === "complete" && runResult
      ? getNextPlayableLevel(runResult.levelId)
      : undefined;

  return (
    <div
      style={{
        padding: isImmersive ? 0 : "16px 12px 48px",
        maxWidth: isImmersive ? "none" : 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {!isImmersive && <GameArcadeNav />}

      {!isImmersive && (
        <>
          <ArcadeSessionBar profile={profile} wallet={wallet} walletLoading={walletLoading} />
          {coinError ? (
            <ArcadeOutOfCoinsNotice message={coinError} onDismiss={() => setCoinError(null)} />
          ) : null}
        </>
      )}

      {!isImmersive && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 24,
            padding: "20px 16px",
            borderRadius: 16,
            border: `1px solid ${t.border}`,
            background: t.surface,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>💣</div>
          <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 800 }}>Render Safe</h1>
          <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
            Fictional retro arcade — lead the assault force to the target.
          </p>
        </div>
      )}

      {screen === "select" && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12, color: t.text }}>Play Level</h2>
          <RenderSafeLevelSelect
            levels={levels}
            selectedLevelId={selectedLevelId}
            personalBests={personalBests}
            onSelectLevel={handleSelectLevel}
          />
          {levels.filter((l) => !l.locked).map((level) => (
            <GameLeaderboard
              key={level.id}
              game="render_safe"
              levelId={level.id}
              levelTitle={level.title}
              accentColor="#f97316"
              entries={leaderboardEntries[level.id]}
              loading={leaderboardsLoading && leaderboardEntries[level.id] == null}
            />
          ))}
        </>
      )}

      {screen === "brief" && selectedLevel && (
        <RenderSafeMissionBrief
          level={selectedLevel}
          onStart={handleStartMission}
          onBack={() => setScreen("select")}
        />
      )}

      {screen === "playing" && selectedLevel && (
        <div
          ref={playAreaRef}
          className="render-safe-play-area"
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <RenderSafeGame
            key={gameKey}
            level={selectedLevel}
            onComplete={handleComplete}
            onRestart={handleRestart}
            onExit={handleExitGame}
            immersive
          />
        </div>
      )}

      {screen === "complete" && runResult && (
        <div style={{ padding: "16px 12px 48px", maxWidth: 520, margin: "0 auto" }}>
          <RenderSafeEndScreen
            result={runResult}
            level={getRenderSafeLevelById(runResult.levelId)}
            personalBestMessage={personalBestMessage}
            isAuthenticated={!!userId}
            nextLevel={nextLevel ? { title: nextLevel.title } : null}
            onNextLevel={nextLevel ? handleNextLevel : undefined}
            onPlayAgain={handleRestart}
            onBackToLevels={() => {
              setScreen("select");
              setRunResult(null);
            }}
          />
        </div>
      )}

      {!isImmersive && (
        <p
          style={{
            marginTop: 32,
            padding: "14px 16px",
            borderRadius: 10,
            border: `1px solid ${t.borderLight}`,
            background: t.bg,
            fontSize: 12,
            color: t.textMuted,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {DISCLAIMER}
        </p>
      )}
    </div>
  );
}
