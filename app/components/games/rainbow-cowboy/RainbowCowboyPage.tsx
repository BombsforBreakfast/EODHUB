"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { useViewerGate } from "@/app/hooks/useRequireFullAccess";
import { clearGameLeaderboardCache } from "@/app/components/games/gameLeaderboardStorage";
import { getLevelConfig, getNextPlayableLevel, getRainbowCowboyLevels } from "./rainbowCowboyLevels";
import {
  buildPersonalBestMessage,
  loadRainbowCowboyArcadeData,
  saveLocalPersonalBest,
  saveRainbowCowboyPersonalBest,
} from "./rainbowCowboyStorage";
import type { RainbowCowboyPersonalBest, RainbowCowboyRunResult, RainbowCowboyDifficulty } from "./rainbowCowboyTypes";
import {
  applyCompletion,
  getHighestUnlockedDifficulty,
  isDifficultyUnlocked,
  isLevelUnlocked,
  type RainbowCowboyProgressMap,
} from "./rainbowCowboyProgression";
import { BombSuitManAvatar } from "@/app/components/games/bomb-suit-man/BombSuitManAvatar";
import { BSM_TITLE_GRADIENT } from "@/app/components/games/bomb-suit-man/bombSuitManTheme";
import { GameArcadeNav } from "@/app/components/games/GameArcadeNav";
import { RainbowCowboyLeaderboardStack } from "./RainbowCowboyLeaderboardStack";
import { RainbowCowboyEndScreen } from "./RainbowCowboyEndScreen";
import { RainbowCowboyLevelSelect } from "./RainbowCowboyLevelSelect";
import { RainbowCowboyStartScreen } from "./RainbowCowboyStartScreen";
import {
  enterArcadeImmersiveMode,
  exitArcadeImmersiveMode,
} from "@/app/components/games/useMobileGameImmersiveMode";
import {
  loadUnicornHeroSelectedRide,
  type UnicornHeroRideType,
} from "../unicorn-hero/unicornHeroRides";

const RainbowCowboyGame = dynamic(
  () => import("./RainbowCowboyGame").then((m) => ({ default: m.RainbowCowboyGame })),
  { ssr: false },
);

type Screen = "select" | "start" | "playing" | "complete" | "game_over";

export function RainbowCowboyPage() {
  const { t } = useTheme();
  const viewer = useViewerGate();
  const userId = viewer?.userId ?? null;

  const levels = useMemo(() => getRainbowCowboyLevels(), []);
  const [screen, setScreen] = useState<Screen>("select");
  const [selectedLevelId, setSelectedLevelId] = useState("level-1");
  const [difficulty, setDifficulty] = useState<RainbowCowboyDifficulty>("easy");
  const [gameKey, setGameKey] = useState(0);
  const [personalBests, setPersonalBests] = useState<Record<string, RainbowCowboyPersonalBest | null>>({});
  const [progress, setProgress] = useState<RainbowCowboyProgressMap>({});
  const [runResult, setRunResult] = useState<RainbowCowboyRunResult | null>(null);
  const [personalBestMessage, setPersonalBestMessage] = useState("");
  const [showInstructions, setShowInstructions] = useState(true);
  const [selectedRide, setSelectedRide] = useState<UnicornHeroRideType>(() => loadUnicornHeroSelectedRide());
  const remoteCompletionWritesThisRunRef = useRef(0);

  const isPlaying = screen === "playing";
  const routeShellRef = useRef<HTMLDivElement>(null);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const levelConfig = useMemo(
    () => getLevelConfig(selectedLevelId, difficulty),
    [selectedLevelId, difficulty],
  );

  useEffect(() => {
    let cancelled = false;
    void loadRainbowCowboyArcadeData(userId).then((data) => {
      if (cancelled) return;
      setPersonalBests(data.personalBests);
      setProgress(data.progress);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (isPlaying) return;
    void exitArcadeImmersiveMode();
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const fit = () => {
      const mobile = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
      if (mobile) return;
      const el = playAreaRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      el.style.height = `${Math.max(400, window.innerHeight - top)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [isPlaying]);

  const handleSelectLevel = useCallback(
    (levelId: string) => {
      if (!isLevelUnlocked(levelId, progress, levels)) return;
      setSelectedLevelId(levelId);
      setDifficulty(getHighestUnlockedDifficulty(levelId, progress, levels));
      setScreen("start");
    },
    [levels, progress],
  );

  const handleStart = useCallback(() => {
    if (!isLevelUnlocked(selectedLevelId, progress, levels)) return;
    if (!isDifficultyUnlocked(selectedLevelId, difficulty, progress, levels)) {
      setDifficulty(getHighestUnlockedDifficulty(selectedLevelId, progress, levels));
      return;
    }
    void enterArcadeImmersiveMode(document.documentElement);
    setShowInstructions(true);
    remoteCompletionWritesThisRunRef.current = 0;
    setGameKey((k) => k + 1);
    setScreen("playing");
  }, [difficulty, levels, progress, selectedLevelId]);

  const handleComplete = useCallback(async (result: RainbowCowboyRunResult) => {
    setRunResult(result);
    if (userId) {
      remoteCompletionWritesThisRunRef.current += 1;
      if (
        process.env.NODE_ENV !== "production" &&
        remoteCompletionWritesThisRunRef.current > 1
      ) {
        console.warn("Rainbow Cowboy attempted more than one remote completion write for this play session.", {
          levelId: result.levelId,
          difficulty: result.difficulty,
          writes: remoteCompletionWritesThisRunRef.current,
        });
      }
    }
    const saveResult = userId
      ? await saveRainbowCowboyPersonalBest(result, userId)
      : saveLocalPersonalBest(result);
    if (saveResult.saved) clearGameLeaderboardCache("rainbow_cowboy");
    setPersonalBestMessage(buildPersonalBestMessage(saveResult, result));
    setProgress((prev) => applyCompletion(prev, result.levelId, result.difficulty));
    setScreen("complete");
  }, [userId]);

  const handleGameOver = useCallback((result: RainbowCowboyRunResult) => {
    setRunResult(result);
    setPersonalBestMessage("");
    setScreen("game_over");
  }, []);

  const handleRestart = useCallback(() => {
    setShowInstructions(false);
    remoteCompletionWritesThisRunRef.current = 0;
    setGameKey((k) => k + 1);
    setRunResult(null);
    setScreen("playing");
  }, []);

  const handleNextLevel = useCallback(() => {
    if (!runResult) return;
    const next = getNextPlayableLevel(runResult.levelId);
    if (!next || !isLevelUnlocked(next.id, progress, levels)) return;
    setSelectedLevelId(next.id);
    setDifficulty("easy");
    setRunResult(null);
    setPersonalBestMessage("");
    setShowInstructions(true);
    setScreen("start");
  }, [levels, progress, runResult]);

  const nextLevelCandidate =
    screen === "complete" && runResult ? getNextPlayableLevel(runResult.levelId) : undefined;
  const nextLevel =
    nextLevelCandidate && isLevelUnlocked(nextLevelCandidate.id, progress, levels)
      ? nextLevelCandidate
      : undefined;

  return (
    <div
      ref={routeShellRef}
      style={{
        padding: isPlaying ? 0 : "16px 12px 48px",
        maxWidth: isPlaying ? "none" : 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {!isPlaying && <GameArcadeNav />}

      {!isPlaying && screen !== "complete" && screen !== "game_over" && (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <BombSuitManAvatar size={56} />
          </div>
          <h1
            style={{
              margin: "8px 0 4px",
              fontSize: 26,
              fontWeight: 800,
              background: BSM_TITLE_GRADIENT,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Bomb Suit Man
          </h1>
          <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
            Retro-style gaming absurdity — EOD operator on robot by default, pink unicorn optional.
          </p>
        </div>
      )}

      {screen === "select" && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12, color: t.text }}>Select Level</h2>
          <RainbowCowboyLevelSelect
            levels={levels}
            personalBests={personalBests}
            progress={progress}
            onSelectLevel={handleSelectLevel}
          />
          <RainbowCowboyLeaderboardStack levels={levels} />
        </>
      )}

      {screen === "start" && levelConfig && (
        <RainbowCowboyStartScreen
          level={levelConfig.level}
          storyIntro={levelConfig.storyIntro}
          selectedRide={selectedRide}
          difficulty={difficulty}
          progress={progress}
          levels={levels}
          onDifficultyChange={setDifficulty}
          onRideChange={setSelectedRide}
          onStart={handleStart}
          onBack={() => setScreen("select")}
        />
      )}

      {screen === "playing" && levelConfig && (
        <div
          ref={playAreaRef}
          className="arcade-game-play-surface"
        >
          <RainbowCowboyGame
            key={gameKey}
            config={levelConfig}
            ride={selectedRide}
            personalBest={personalBests[selectedLevelId] ?? null}
            showInstructions={showInstructions}
            onComplete={handleComplete}
            onGameOver={handleGameOver}
            onExit={() => setScreen("select")}
          />
        </div>
      )}

      {(screen === "complete" || screen === "game_over") && runResult && (
        <RainbowCowboyEndScreen
          result={runResult}
          personalBestMessage={personalBestMessage}
          isAuthenticated={!!userId}
          isVictory={screen === "complete"}
          nextLevel={nextLevel ? { title: nextLevel.title } : null}
          onNextLevel={nextLevel ? handleNextLevel : undefined}
          onRestart={handleRestart}
          onBack={() => {
            setScreen("select");
            setRunResult(null);
          }}
        />
      )}
    </div>
  );
}
