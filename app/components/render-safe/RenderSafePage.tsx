"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { useViewerGate } from "@/app/hooks/useRequireFullAccess";
import { RenderSafeEndScreen } from "./RenderSafeEndScreen";
import { RenderSafeGame } from "./RenderSafeGame";
import { RenderSafeLevelSelect } from "./RenderSafeLevelSelect";
import { RenderSafeMissionBrief } from "./RenderSafeMissionBrief";
import { getRenderSafeLevelById, getRenderSafeLevels } from "./renderSafeLevels";
import {
  getLocalPersonalBest,
  getRenderSafePersonalBest,
  saveLocalPersonalBest,
  saveRenderSafePersonalBest,
} from "./renderSafeStorage";
import type { RenderSafeRunResult } from "./renderSafeTypes";

const DISCLAIMER =
  "Render Safe is a fictional arcade game for community engagement only. It does not teach or represent real EOD procedures.";

export function RenderSafePage() {
  const { t } = useTheme();
  const viewer = useViewerGate();
  const userId = viewer?.userId ?? null;

  const levels = getRenderSafeLevels();
  const [screen, setScreen] = useState<"select" | "brief" | "playing" | "complete">("select");
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>("level-1");
  const [gameKey, setGameKey] = useState(0);
  const [personalBests, setPersonalBests] = useState<Record<string, number | null>>({});
  const [runResult, setRunResult] = useState<RenderSafeRunResult | null>(null);
  const [personalBestMessage, setPersonalBestMessage] = useState("");

  const selectedLevel = selectedLevelId ? getRenderSafeLevelById(selectedLevelId) : null;
  const isPlaying = screen === "playing";
  const isImmersive = isPlaying;

  const loadPersonalBests = useCallback(async () => {
    const bests: Record<string, number | null> = {};
    for (const level of levels) {
      if (userId) {
        const best = await getRenderSafePersonalBest(level.id, userId);
        bests[level.id] = best?.score ?? null;
      } else {
        bests[level.id] = getLocalPersonalBest(level.id);
      }
    }
    setPersonalBests(bests);
  }, [levels, userId]);

  useEffect(() => {
    loadPersonalBests();
  }, [loadPersonalBests]);

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

  const handleStartMission = () => {
    setGameKey((k) => k + 1);
    setScreen("playing");
  };

  const handleComplete = async (result: RenderSafeRunResult) => {
    setRunResult(result);

    if (userId) {
      const saveResult = await saveRenderSafePersonalBest(result, userId);
      if (saveResult.saved && saveResult.previousBest == null) {
        setPersonalBestMessage("Personal Best Saved");
      } else if (saveResult.saved && saveResult.isNewBest) {
        setPersonalBestMessage("New Personal Best!");
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

  const handleRestart = () => {
    setGameKey((k) => k + 1);
    setScreen("playing");
    setRunResult(null);
  };

  const handleExitGame = () => {
    setScreen("select");
    setRunResult(null);
  };

  return (
    <div
      style={{
        padding: isImmersive ? 0 : "16px 12px 48px",
        maxWidth: isImmersive ? "none" : 720,
        margin: "0 auto",
        width: "100%",
      }}
    >
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
            personalBestMessage={personalBestMessage}
            isAuthenticated={!!userId}
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
