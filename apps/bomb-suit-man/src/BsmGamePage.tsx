import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { clearGameLeaderboardCache } from "@bsm/lib/bsmLeaderboardStorage";
import { getLevelConfig, getNextPlayableLevel, getRainbowCowboyLevels } from "@/app/components/games/rainbow-cowboy/rainbowCowboyLevels";
import {
  applyCompletion,
  getHighestUnlockedDifficulty,
  isDifficultyUnlocked,
  isLevelUnlocked,
  type RainbowCowboyProgressMap,
} from "@/app/components/games/rainbow-cowboy/rainbowCowboyProgression";
import type {
  RainbowCowboyDifficulty,
  RainbowCowboyPersonalBest,
  RainbowCowboyRunResult,
} from "@/app/components/games/rainbow-cowboy/rainbowCowboyTypes";
import { BombSuitManAvatar } from "@/app/components/games/bomb-suit-man/BombSuitManAvatar";
import { BSM_TITLE_GRADIENT } from "@/app/components/games/bomb-suit-man/bombSuitManTheme";
import { RainbowCowboyEndScreen } from "@/app/components/games/rainbow-cowboy/RainbowCowboyEndScreen";
import { RainbowCowboyLevelSelect } from "@/app/components/games/rainbow-cowboy/RainbowCowboyLevelSelect";
import { RainbowCowboyStartScreen } from "@/app/components/games/rainbow-cowboy/RainbowCowboyStartScreen";
import { exitArcadeImmersiveMode } from "@/app/components/games/useMobileGameImmersiveMode";
import { syncGameViewportCssVars } from "@/app/components/games/arcadeImmersiveMode";
import {
  loadUnicornHeroSelectedRide,
  type UnicornHeroRideType,
} from "@/app/components/games/unicorn-hero/unicornHeroRides";
import { useAuth } from "@bsm/context/AuthProvider";
import {
  buildPersonalBestMessage,
  loadBsmArcadeData,
  saveBsmPersonalBest,
  saveLocalPersonalBest,
} from "@bsm/lib/bsmStorage";
import {
  canPlayLevelAsGuest,
  guestSignupWallMessage,
  isGuestPlayableLevel,
} from "@bsm/lib/guestGate";
import { AuthScreen } from "@bsm/screens/AuthScreen";

const RainbowCowboyGame = lazy(async () => {
  const mod = await import("@/app/components/games/rainbow-cowboy/RainbowCowboyGame");
  return { default: mod.RainbowCowboyGame };
});

type Screen = "select" | "start" | "playing" | "complete" | "game_over" | "auth";

export function BsmGamePage() {
  const { t } = useTheme();
  const { user, signOut } = useAuth();
  const userId = user?.id ?? null;
  const isSignedIn = Boolean(userId);

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
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  const isPlaying = screen === "playing";
  const playAreaRef = useRef<HTMLDivElement>(null);
  const levelConfig = useMemo(
    () => getLevelConfig(selectedLevelId, difficulty),
    [selectedLevelId, difficulty],
  );

  useEffect(() => {
    let cancelled = false;
    void loadBsmArcadeData(userId).then((data) => {
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
    const fit = () => syncGameViewportCssVars();
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [isPlaying]);

  const openAuth = useCallback((message?: string) => {
    setAuthPrompt(message ?? guestSignupWallMessage("level-3"));
    setScreen("auth");
  }, []);

  const handleSelectLevel = useCallback(
    (levelId: string) => {
      if (!canPlayLevelAsGuest(levelId, isSignedIn)) {
        openAuth(guestSignupWallMessage(levelId));
        return;
      }
      if (!isLevelUnlocked(levelId, progress, levels)) return;
      setSelectedLevelId(levelId);
      setDifficulty(getHighestUnlockedDifficulty(levelId, progress, levels));
      setScreen("start");
    },
    [isSignedIn, levels, openAuth, progress],
  );

  const handleStart = useCallback(async () => {
    if (!canPlayLevelAsGuest(selectedLevelId, isSignedIn)) {
      openAuth();
      return;
    }
    if (!isLevelUnlocked(selectedLevelId, progress, levels)) return;
    if (!isDifficultyUnlocked(selectedLevelId, difficulty, progress, levels)) {
      setDifficulty(getHighestUnlockedDifficulty(selectedLevelId, progress, levels));
      return;
    }
    syncGameViewportCssVars();
    setShowInstructions(true);
    setGameKey((k) => k + 1);
    setScreen("playing");
  }, [difficulty, isSignedIn, levels, openAuth, progress, selectedLevelId]);

  const handleComplete = useCallback(
    async (result: RainbowCowboyRunResult) => {
      setRunResult(result);
      const saveResult = userId
        ? await saveBsmPersonalBest(result, userId)
        : saveLocalPersonalBest(result);
      if (saveResult.saved) {
        clearGameLeaderboardCache();
        setLeaderboardRefreshKey((key) => key + 1);
      }
      setPersonalBestMessage(buildPersonalBestMessage(saveResult, result));
      setProgress((prev) => applyCompletion(prev, result.levelId, result.difficulty));
      setScreen("complete");
    },
    [userId],
  );

  const handleGameOver = useCallback((result: RainbowCowboyRunResult) => {
    setRunResult(result);
    setPersonalBestMessage("");
    setScreen("game_over");
  }, []);

  const handleRestart = useCallback(() => {
    if (!runResult) return;
    setShowInstructions(false);
    setGameKey((k) => k + 1);
    setRunResult(null);
    setScreen("playing");
  }, [runResult]);

  const handleNextLevel = useCallback(() => {
    if (!runResult) return;
    const next = getNextPlayableLevel(runResult.levelId);
    if (!next) return;
    if (!canPlayLevelAsGuest(next.id, isSignedIn)) {
      openAuth(`Nice run! ${guestSignupWallMessage(next.id)}`);
      return;
    }
    if (!isLevelUnlocked(next.id, progress, levels)) return;
    setSelectedLevelId(next.id);
    setDifficulty("easy");
    setRunResult(null);
    setPersonalBestMessage("");
    setShowInstructions(true);
    setScreen("start");
  }, [isSignedIn, levels, openAuth, progress, runResult]);

  const nextLevelCandidate =
    screen === "complete" && runResult ? getNextPlayableLevel(runResult.levelId) : undefined;
  const nextLevel =
    nextLevelCandidate && isLevelUnlocked(nextLevelCandidate.id, progress, levels)
      ? nextLevelCandidate
      : undefined;

  const nextLevelBlockedForGuest =
    nextLevel != null && !canPlayLevelAsGuest(nextLevel.id, isSignedIn);

  if (screen === "auth") {
    return (
      <AuthScreen
        title="Save your progress"
        subtitle={authPrompt ?? guestSignupWallMessage("level-3")}
        onDismiss={() => setScreen("select")}
      />
    );
  }

  return (
    <div
      style={{
        padding: isPlaying ? 0 : "16px 12px 48px",
        maxWidth: isPlaying ? "none" : 720,
        margin: "0 auto",
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        background: t.bg,
        color: t.text,
      }}
    >
      {!isPlaying && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
            {isSignedIn ? "Signed in" : "Guest · Levels 1–2"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isSignedIn ? (
              <button type="button" onClick={() => void signOut()} style={headerButtonStyle(t.border, t.text)}>
                Sign out
              </button>
            ) : (
              <button type="button" onClick={() => openAuth()} style={headerButtonStyle(t.border, t.text)}>
                Sign up
              </button>
            )}
          </div>
        </div>
      )}

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
            Retro arcade chaos — robot or pink unicorn. Eat drones. Question your life choices.
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
            refreshKey={leaderboardRefreshKey}
            showLeaderboards={isSignedIn}
            isAccessBlocked={(levelId) => !isSignedIn && !isGuestPlayableLevel(levelId)}
            getAccessBlockMessage={() => "Sign up to unlock"}
            onSelectLevel={handleSelectLevel}
          />
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
          onStart={() => void handleStart()}
          onBack={() => setScreen("select")}
        />
      )}

      {screen === "playing" && levelConfig && (
        <div ref={playAreaRef} className="arcade-game-play-surface">
          <Suspense fallback={<div style={{ color: "#fff", padding: 24 }}>Loading game…</div>}>
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
          </Suspense>
        </div>
      )}

      {(screen === "complete" || screen === "game_over") && runResult && (
        <RainbowCowboyEndScreen
          result={runResult}
          personalBestMessage={personalBestMessage}
          isAuthenticated={isSignedIn}
          isVictory={screen === "complete"}
          nextLevel={nextLevel && !nextLevelBlockedForGuest ? { title: nextLevel.title } : null}
          onNextLevel={
            nextLevel && !nextLevelBlockedForGuest
              ? handleNextLevel
              : nextLevelBlockedForGuest
                ? () => openAuth(`Nice run! ${guestSignupWallMessage(nextLevel.id)}`)
                : undefined
          }
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

function headerButtonStyle(border: string, text: string) {
  return {
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: "transparent",
    color: text,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  } as const;
}
