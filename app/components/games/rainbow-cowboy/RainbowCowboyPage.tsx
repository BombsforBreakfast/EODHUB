"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { useViewerGate } from "@/app/hooks/useRequireFullAccess";
import { getLevelConfig, getNextPlayableLevel, getRainbowCowboyLevels } from "./rainbowCowboyLevels";
import {
  buildPersonalBestMessage,
  getLocalPersonalBest,
  getRainbowCowboyPersonalBest,
  getRainbowCowboyProgress,
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
import { GameLeaderboard } from "@/app/components/games/GameLeaderboard";
import { GameArcadeNav } from "@/app/components/games/GameArcadeNav";
import { RainbowCowboyEndScreen } from "./RainbowCowboyEndScreen";
import { RainbowCowboyGame } from "./RainbowCowboyGame";
import { RainbowCowboyLevelSelect } from "./RainbowCowboyLevelSelect";
import { RainbowCowboyStartScreen } from "./RainbowCowboyStartScreen";
import {
  loadUnicornHeroSelectedRide,
  type UnicornHeroRideType,
} from "../unicorn-hero/unicornHeroRides";

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

  const isPlaying = screen === "playing";
  const playAreaRef = useRef<HTMLDivElement>(null);
  const levelConfig = useMemo(
    () => getLevelConfig(selectedLevelId, difficulty),
    [selectedLevelId, difficulty],
  );

  const loadPersonalBests = useCallback(async () => {
    const bests: Record<string, RainbowCowboyPersonalBest | null> = {};
    for (const level of levels) {
      if (level.locked) continue;
      if (userId) {
        bests[level.id] = await getRainbowCowboyPersonalBest(level.id, userId);
      } else {
        bests[level.id] = getLocalPersonalBest(level.id);
      }
    }
    setPersonalBests(bests);
  }, [levels, userId]);

  const loadProgress = useCallback(async () => {
    const next = await getRainbowCowboyProgress(userId);
    setProgress(next);
  }, [userId]);

  useEffect(() => {
    void loadPersonalBests();
    void loadProgress();
  }, [loadPersonalBests, loadProgress]);

  useEffect(() => {
    if (!isPlaying) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const fit = () => {
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
    setShowInstructions(true);
    setGameKey((k) => k + 1);
    setScreen("playing");
  }, [difficulty, levels, progress, selectedLevelId]);

  const handleComplete = useCallback(async (result: RainbowCowboyRunResult) => {
    setRunResult(result);
    const saveResult = userId
      ? await saveRainbowCowboyPersonalBest(result, userId)
      : saveLocalPersonalBest(result);
    setPersonalBestMessage(buildPersonalBestMessage(saveResult, result));
    setProgress((prev) => applyCompletion(prev, result.levelId, result.difficulty));
    await loadPersonalBests();
    await loadProgress();
    setScreen("complete");
  }, [loadPersonalBests, loadProgress, userId]);

  const handleGameOver = useCallback((result: RainbowCowboyRunResult) => {
    setRunResult(result);
    setPersonalBestMessage("");
    setScreen("game_over");
  }, []);

  const handleRestart = useCallback(() => {
    setShowInstructions(false);
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
          <div style={{ fontSize: 36 }}>🦄</div>
          <h1 style={{ margin: "8px 0 4px", fontSize: 26, fontWeight: 800 }}>Unicorn Hero</h1>
          <p style={{ margin: 0, color: t.textMuted, fontSize: 14 }}>
            Retro-style gaming absurdity on a pink unicorn or EOD robot.
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
          {levels
            .filter((level) => !level.locked && level.status !== "coming_soon")
            .map((level) => (
              <GameLeaderboard
                key={level.id}
                game="rainbow_cowboy"
                levelId={level.id}
                levelTitle={level.title}
                accentColor="#ff60c0"
              />
            ))}
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
          style={{
            width: "min(1000px, 95vw)",
            maxWidth: "100%",
            height: "calc(100vh - 80px)",
            margin: "0 auto",
            display: "flex",
          }}
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
