"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";
import { RainbowCowboyEngine, RAINBOW_COWBOY_ENGINE_REVISION, type GameInput } from "./rainbowCowboyEngine";
import { drawWorld, maybeSpawnDust } from "./rainbowCowboyGraphics";
import { RainbowCowboyParticlePool } from "./rainbowCowboyParticles";
import type { LevelConfig, RainbowCowboyPersonalBest } from "./rainbowCowboyTypes";
import type { RainbowCowboyHudSnapshot, RainbowCowboyRunResult } from "./rainbowCowboyTypes";
import { RainbowCowboyControls } from "./RainbowCowboyControls";
import { RainbowCowboyControlSettings } from "./RainbowCowboyControlSettings";
import {
  loadRainbowCowboyControlPrefs,
  type RainbowCowboyControlPrefs,
} from "./rainbowCowboyControlPrefs";
import { RainbowCowboyHud } from "./RainbowCowboyHud";
import { RainbowCowboyInstructionsModal } from "./RainbowCowboyInstructionsModal";
import {
  createUnicornHeroAudio,
  loadUnicornHeroAudioPrefs,
  type UnicornHeroAudioPrefs,
} from "../unicorn-hero/unicornHeroAudio";
import { UnicornHeroAudioControls } from "../unicorn-hero/UnicornHeroAudioControls";
import { getUnicornHeroRideConfig, type UnicornHeroRideType } from "../unicorn-hero/unicornHeroRides";
import { getLevelAttackLabel, getLevelSpecialLabel } from "./rainbowCowboyLevel5";
import { GameRotatePrompt } from "@/app/components/games/GameRotatePrompt";
import { exitArcadeImmersiveMode } from "@/app/components/games/arcadeImmersiveMode";
import { useMobileGameImmersiveMode } from "@/app/components/games/useMobileGameImmersiveMode";
import { createRainbowCowboyInputBridge } from "./rainbowCowboyGameInput";

interface Props {
  config: LevelConfig;
  ride: UnicornHeroRideType;
  personalBest: RainbowCowboyPersonalBest | null;
  showInstructions?: boolean;
  onComplete: (result: RainbowCowboyRunResult) => void;
  onGameOver: (result: RainbowCowboyRunResult) => void;
  onExit: () => void;
}

const defaultHud: RainbowCowboyHudSnapshot = {
  hearts: 5,
  maxHearts: 5,
  score: 0,
  rainbowCharges: 0,
  elapsedSeconds: 0,
  status: "Riding",
  gassed: false,
  rampage: false,
  popupText: null,
  popupUntil: 0,
  blasterActive: false,
  blasterSecondsLeft: 0,
  weaponLabel: null,
  bazookaAmmo: 0,
};

function isStaleEngine(engine: RainbowCowboyEngine | null): boolean {
  if (!engine) return true;
  return (
    typeof engine.tick !== "function" ||
    !Array.isArray(engine.landmineExplosionEvents) ||
    !Array.isArray(engine.audioEvents) ||
    !Array.isArray(engine.spearProjectiles) ||
    typeof engine.prevPlayerX !== "number" ||
    typeof engine.rideType !== "string"
  );
}

export function RainbowCowboyGame({
  config,
  ride,
  personalBest,
  showInstructions = true,
  onComplete,
  onGameOver,
  onExit,
}: Props) {
  const rideConfig = getUnicornHeroRideConfig(ride);
  const attackLabel = getLevelAttackLabel(config.level.id, rideConfig.attackLabel);
  const specialLabel = getLevelSpecialLabel(config.level.id, rideConfig.specialLabel);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RainbowCowboyEngine | null>(null);
  const inputRef = useRef<GameInput>({
    left: false,
    right: false,
    down: false,
    up: false,
    jumpPressed: false,
    tonguePressed: false,
    gunPressed: false,
    gunHeld: false,
    rainbowPressed: false,
    pausePressed: false,
  });
  const endedRef = useRef(false);
  const particlesRef = useRef<RainbowCowboyParticlePool>(new RainbowCowboyParticlePool());
  const prevPosRef = useRef({ x: 0, y: 0 });
  const engineRevisionRef = useRef(RAINBOW_COWBOY_ENGINE_REVISION);
  const instructionsOpenRef = useRef(showInstructions);
  const onCompleteRef = useRef(onComplete);
  const onGameOverRef = useRef(onGameOver);
  const audioRef = useRef<ReturnType<typeof createUnicornHeroAudio> | null>(null);
  const audioStartedRef = useRef(false);
  const rampageRef = useRef(false);
  const musicPausedRef = useRef(false);
  const pausedUiRef = useRef(false);
  const hiddenRef = useRef(false);
  const [hud, setHud] = useState(defaultHud);
  const [paused, setPaused] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(showInstructions);
  const [audioPrefs, setAudioPrefs] = useState<UnicornHeroAudioPrefs>(() => loadUnicornHeroAudioPrefs());
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [controlPrefs, setControlPrefs] = useState<RainbowCowboyControlPrefs>(() =>
    loadRainbowCowboyControlPrefs(),
  );

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onGameOverRef.current = onGameOver;
  }, [onComplete, onGameOver]);

  useEffect(() => {
    let cancelled = false;
    const syncInstructions = () => {
      if (cancelled) return;
      setInstructionsOpen(showInstructions);
    };
    if (!showInstructions) {
      instructionsOpenRef.current = false;
      queueMicrotask(syncInstructions);
      return;
    }
    instructionsOpenRef.current = true;
    queueMicrotask(syncInstructions);
    return () => {
      cancelled = true;
    };
  }, [showInstructions]);

  useEffect(() => {
    const engine = new RainbowCowboyEngine(config, ride);
    engineRef.current = engine;
    engineRevisionRef.current = RAINBOW_COWBOY_ENGINE_REVISION;
    endedRef.current = false;
    audioStartedRef.current = false;
    rampageRef.current = false;
    musicPausedRef.current = false;
    pausedUiRef.current = false;
    prevPosRef.current = { x: engine.playerX, y: engine.playerY };
    particlesRef.current.tick(9999);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setHud(defaultHud);
      setPaused(false);
    });
    return () => {
      cancelled = true;
    };
  }, [config, ride]);

  useEffect(() => {
    const audio = createUnicornHeroAudio(loadUnicornHeroAudioPrefs());
    audioRef.current = audio;
    return () => {
      audio.destroy();
      audioRef.current = null;
    };
  }, []);

  const beginGameplayAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || audioStartedRef.current) return;
    audioStartedRef.current = true;
    audio.applyPrefs(loadUnicornHeroAudioPrefs());
    await audio.init();
    audio.startMusic();
  }, []);

  const syncAudioPrefs = useCallback((next: UnicornHeroAudioPrefs) => {
    setAudioPrefs(next);
    audioRef.current?.applyPrefs(next);
  }, []);

  const requestPauseToggle = useCallback(() => {
    if (instructionsOpenRef.current || endedRef.current) return;
    inputRef.current.pausePressed = true;
  }, []);

  const handleExitArcade = useCallback(() => {
    void exitArcadeImmersiveMode();
    onExit();
  }, [onExit]);

  useEffect(() => {
    if (!instructionsOpen) void beginGameplayAudio();
  }, [instructionsOpen, beginGameplayAudio]);

  useEffect(() => {
    const syncVisibility = () => {
      hiddenRef.current = document.hidden;
      if (document.hidden) {
        audioRef.current?.pauseMusic();
      } else {
        const engine = engineRef.current;
        if (audioStartedRef.current && engine?.phase === "playing" && !musicPausedRef.current) {
          audioRef.current?.resumeMusic();
        }
      }
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useMobileGameImmersiveMode(true, shellRef);

  const inputActions = useMemo(() => createRainbowCowboyInputBridge(inputRef), []);

  const consumeEdgeInputs = useCallback(() => {
    const input = inputRef.current;
    const edge = {
      left: input.left,
      right: input.right,
      down: input.down,
      up: input.up,
      jumpPressed: input.jumpPressed,
      tonguePressed: input.tonguePressed,
      gunPressed: input.gunPressed,
      gunHeld: input.gunHeld,
      rainbowPressed: input.rainbowPressed,
      pausePressed: input.pausePressed,
    };
    input.jumpPressed = false;
    input.tonguePressed = false;
    input.gunPressed = false;
    input.rainbowPressed = false;
    input.pausePressed = false;
    return edge;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      if (hiddenRef.current) {
        last = now;
        raf = requestAnimationFrame(loop);
        return;
      }

      let engine = engineRef.current;
      if (
        isStaleEngine(engine) ||
        engineRevisionRef.current !== RAINBOW_COWBOY_ENGINE_REVISION
      ) {
        engine = new RainbowCowboyEngine(config, ride);
        engineRef.current = engine;
        engineRevisionRef.current = RAINBOW_COWBOY_ENGINE_REVISION;
        prevPosRef.current = { x: engine.playerX, y: engine.playerY };
        endedRef.current = false;
      }
      if (!engine) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min(32, now - last);
      if (!instructionsOpenRef.current) {
        last = now;
        const input = consumeEdgeInputs();
        engine.tick(dt, input);
      } else {
        last = now;
      }

      const isPaused = engine.phase === "paused";
      if (isPaused !== pausedUiRef.current) {
        pausedUiRef.current = isPaused;
        setPaused(isPaused);
      }
      if (isPaused) {
        if (!musicPausedRef.current) {
          audioRef.current?.pauseMusic();
          musicPausedRef.current = true;
        }
      } else if (musicPausedRef.current && engine.phase === "playing") {
        audioRef.current?.resumeMusic();
        musicPausedRef.current = false;
      }

      const nextHud = engine.getHud();
      if (nextHud.rampage !== rampageRef.current) {
        rampageRef.current = nextHud.rampage;
        audioRef.current?.setRampageMode(nextHud.rampage);
      }

      if (engine.audioEvents.length > 0) {
        const audio = audioRef.current;
        if (audio) {
          for (const event of engine.audioEvents) audio.handleEvent(event);
        }
        engine.audioEvents = [];
      }

      setHud((prev) =>
        prev.score === nextHud.score &&
        prev.hearts === nextHud.hearts &&
        prev.status === nextHud.status &&
        prev.rainbowCharges === nextHud.rainbowCharges &&
        prev.elapsedSeconds === nextHud.elapsedSeconds &&
        prev.popupText === nextHud.popupText &&
        prev.weaponLabel === nextHud.weaponLabel &&
        prev.blasterActive === nextHud.blasterActive
          ? prev
          : nextHud,
      );

      const particles = particlesRef.current!;
      particles.tick(dt);
      maybeSpawnDust(particles, engine, prevPosRef.current.x, prevPosRef.current.y);
      if (engine.landmineExplosionEvents.length > 0) {
        for (const fx of engine.landmineExplosionEvents) {
          particles.spawnExplosion(fx.x, fx.groundY, engine.cameraX);
        }
        engine.landmineExplosionEvents = [];
      }
      prevPosRef.current = { x: engine.playerX, y: engine.playerY };

      drawWorld(ctx, engine, now, particles);

      if (!endedRef.current) {
        if (engine.phase === "complete") {
          endedRef.current = true;
          onCompleteRef.current(engine.buildResult());
        } else if (engine.phase === "game_over") {
          endedRef.current = true;
          onGameOverRef.current(engine.buildResult());
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [config, consumeEdgeInputs, ride]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (instructionsOpenRef.current) return;
      const k = e.key.toLowerCase();
      const input = inputRef.current;
      if (k === "a" || k === "arrowleft") input.left = true;
      if (k === "d" || k === "arrowright") input.right = true;
      if (k === "s" || k === "arrowdown") input.down = true;
      if (k === " " || k === "arrowup" || k === "w") {
        e.preventDefault();
        input.jumpPressed = true;
      }
      if (k === "r") input.tonguePressed = true;
      if (k === "t") {
        input.gunPressed = true;
        input.gunHeld = true;
      }
      if (k === "e") input.rainbowPressed = true;
      if (k === "escape") input.pausePressed = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (instructionsOpenRef.current) return;
      const k = e.key.toLowerCase();
      const input = inputRef.current;
      if (k === "a" || k === "arrowleft") input.left = false;
      if (k === "d" || k === "arrowright") input.right = false;
      if (k === "s" || k === "arrowdown") input.down = false;
      if (k === "t") input.gunHeld = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className="rainbow-cowboy-game-shell arcade-game-shell"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#090612",
        overflow: "hidden",
      }}
    >
      <div className="rc-top-actions">
        <button
          type="button"
          onClick={() => setShowAudioPanel((v) => !v)}
          className="rc-top-action-button rc-audio-button"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "2px solid rgba(255,96,192,0.5)",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          {audioPrefs.musicEnabled || audioPrefs.sfxEnabled ? "🔊" : "🔇"}
        </button>

        <button
          type="button"
          onClick={requestPauseToggle}
          disabled={instructionsOpen}
          className="rc-top-action-button"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "2px solid rgba(255,224,128,0.65)",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            cursor: instructionsOpen ? "not-allowed" : "pointer",
            fontFamily: "monospace",
          }}
        >
          Pause
        </button>

        <button
          type="button"
          onClick={handleExitArcade}
          className="rc-top-action-button"
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "2px solid rgba(255,96,192,0.6)",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          Exit Arcade
        </button>
      </div>

      {showAudioPanel && (
        <div
          style={{
            position: "absolute",
            top: 44,
            right: "max(8px, env(safe-area-inset-right, 0px))",
            zIndex: 35,
            width: 220,
          }}
        >
          <UnicornHeroAudioControls
            compact
            prefs={audioPrefs}
            onChange={syncAudioPrefs}
            onInteract={() => void audioRef.current?.init()}
          />
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          imageRendering: "pixelated",
          touchAction: "none",
        }}
      />

      <RainbowCowboyHud
        hud={hud}
        personalBest={personalBest}
        levelTitle={config.level.title}
        rideLabel={rideConfig.label}
      />

      <RainbowCowboyInstructionsModal
        open={instructionsOpen}
        levelId={config.level.id}
        attackLabel={attackLabel}
        specialLabel={specialLabel}
        onDismiss={() => {
          instructionsOpenRef.current = false;
          setInstructionsOpen(false);
          inputRef.current = {
            left: false,
            right: false,
            down: false,
            up: false,
            jumpPressed: false,
            tonguePressed: false,
            gunPressed: false,
            gunHeld: false,
            rainbowPressed: false,
            pausePressed: false,
          };
        }}
      />

      <RainbowCowboyControls
        actions={inputActions}
        disabled={paused || instructionsOpen}
        showWeaponButton={config.level.id === "level-3"}
        attackLabel={attackLabel}
        specialLabel={specialLabel}
        specialCharges={hud.rainbowCharges}
        controlPrefs={controlPrefs}
      />

      {paused && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 25,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            fontSize: 28,
            fontWeight: 800,
            color: "#fff",
            padding: 16,
          }}
        >
          <div style={{ marginBottom: 16 }}>PAUSED</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
            <button
              type="button"
              onClick={requestPauseToggle}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #ff80d0, #a855f7)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              Resume
            </button>
            <button
              type="button"
              onClick={handleExitArcade}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "2px solid rgba(255,255,255,0.45)",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              Exit Arcade
            </button>
          </div>
          <div style={{ width: "min(320px, 92vw)", display: "flex", flexDirection: "column", gap: 12 }}>
            <RainbowCowboyControlSettings
              compact
              prefs={controlPrefs}
              onChange={setControlPrefs}
            />
            <UnicornHeroAudioControls
              prefs={audioPrefs}
              onChange={syncAudioPrefs}
              onInteract={() => void audioRef.current?.init()}
            />
          </div>
        </div>
      )}

      <GameRotatePrompt
        emoji="🦄"
        title="Rotate your phone sideways to play Unicorn Hero"
        subtitle="Landscape unlocks the full arcade view and touch controls."
      />

    </div>
  );
}
