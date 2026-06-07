"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";
import { RainbowCowboyEngine, RAINBOW_COWBOY_ENGINE_REVISION, type GameInput } from "./rainbowCowboyEngine";
import { drawWorld, maybeSpawnDust } from "./rainbowCowboyGraphics";
import { RainbowCowboyParticlePool } from "./rainbowCowboyParticles";
import type { LevelConfig, RainbowCowboyPersonalBest } from "./rainbowCowboyTypes";
import type { RainbowCowboyHudSnapshot, RainbowCowboyRunResult } from "./rainbowCowboyTypes";
import { RainbowCowboyControls } from "./RainbowCowboyControls";
import { RainbowCowboyHud } from "./RainbowCowboyHud";
import { RainbowCowboyInstructionsModal } from "./RainbowCowboyInstructionsModal";
import {
  createUnicornHeroAudio,
  loadUnicornHeroAudioPrefs,
  type UnicornHeroAudioPrefs,
} from "../unicorn-hero/unicornHeroAudio";
import { UnicornHeroAudioControls } from "../unicorn-hero/UnicornHeroAudioControls";
import { getUnicornHeroRideConfig, type UnicornHeroRideType } from "../unicorn-hero/unicornHeroRides";

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
};

function isStaleEngine(engine: RainbowCowboyEngine | null): boolean {
  if (!engine) return true;
  return (
    typeof engine.tick !== "function" ||
    !Array.isArray(engine.landmineExplosionEvents) ||
    !Array.isArray(engine.audioEvents) ||
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RainbowCowboyEngine | null>(null);
  const inputRef = useRef<GameInput>({
    left: false,
    right: false,
    down: false,
    jumpPressed: false,
    tonguePressed: false,
    rainbowPressed: false,
    pausePressed: false,
  });
  const endedRef = useRef(false);
  const particlesRef = useRef<RainbowCowboyParticlePool | null>(null);
  const prevPosRef = useRef({ x: 0, y: 0 });
  const engineRevisionRef = useRef(RAINBOW_COWBOY_ENGINE_REVISION);
  const instructionsOpenRef = useRef(showInstructions);
  const audioRef = useRef<ReturnType<typeof createUnicornHeroAudio> | null>(null);
  const audioStartedRef = useRef(false);
  const rampageRef = useRef(false);
  const musicPausedRef = useRef(false);
  const [hud, setHud] = useState(defaultHud);
  const [paused, setPaused] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(showInstructions);
  const [audioPrefs, setAudioPrefs] = useState<UnicornHeroAudioPrefs>(() => loadUnicornHeroAudioPrefs());
  const [showAudioPanel, setShowAudioPanel] = useState(false);

  if (!particlesRef.current) particlesRef.current = new RainbowCowboyParticlePool();

  useEffect(() => {
    instructionsOpenRef.current = showInstructions;
    setInstructionsOpen(showInstructions);
  }, [showInstructions, config]);

  useEffect(() => {
    const engine = new RainbowCowboyEngine(config, ride);
    engineRef.current = engine;
    engineRevisionRef.current = RAINBOW_COWBOY_ENGINE_REVISION;
    endedRef.current = false;
    audioStartedRef.current = false;
    rampageRef.current = false;
    musicPausedRef.current = false;
    prevPosRef.current = { x: engine.playerX, y: engine.playerY };
    particlesRef.current?.tick(9999);
    setHud(defaultHud);
    setPaused(false);
  }, [config, ride]);

  useEffect(() => {
    const audio = createUnicornHeroAudio(loadUnicornHeroAudioPrefs());
    audioRef.current = audio;
    setAudioPrefs(audio.getPrefs());
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

  useEffect(() => {
    if (!instructionsOpen) void beginGameplayAudio();
  }, [instructionsOpen, beginGameplayAudio]);

  const consumeEdgeInputs = useCallback(() => {
    const input = inputRef.current;
    const edge = {
      left: input.left,
      right: input.right,
      down: input.down,
      jumpPressed: input.jumpPressed,
      tonguePressed: input.tonguePressed,
      rainbowPressed: input.rainbowPressed,
      pausePressed: input.pausePressed,
    };
    input.jumpPressed = false;
    input.tonguePressed = false;
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
      let engine = engineRef.current;
      if (
        isStaleEngine(engine) ||
        engineRevisionRef.current !== RAINBOW_COWBOY_ENGINE_REVISION
      ) {
        engine = new RainbowCowboyEngine(config);
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

      if (engine.phase === "paused") {
        setPaused(true);
        if (!musicPausedRef.current) {
          audioRef.current?.pauseMusic();
          musicPausedRef.current = true;
        }
      } else {
        setPaused(false);
        if (musicPausedRef.current && engine.phase === "playing") {
          audioRef.current?.resumeMusic();
          musicPausedRef.current = false;
        }
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
        prev.popupText === nextHud.popupText
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
          onComplete(engine.buildResult());
        } else if (engine.phase === "game_over") {
          endedRef.current = true;
          onGameOver(engine.buildResult());
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [config, consumeEdgeInputs, onComplete, onGameOver]);

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
      className="rainbow-cowboy-game-shell"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#1a1030",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setShowAudioPanel((v) => !v)}
        style={{
          position: "absolute",
          top: 8,
          right: 92,
          zIndex: 30,
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

      {showAudioPanel && (
        <div style={{ position: "absolute", top: 44, right: 8, zIndex: 35, width: 220 }}>
          <UnicornHeroAudioControls
            compact
            prefs={audioPrefs}
            onChange={syncAudioPrefs}
            onInteract={() => void audioRef.current?.init()}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onExit}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 30,
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
        Exit Game
      </button>

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
        attackLabel={rideConfig.attackLabel}
        specialLabel={rideConfig.specialLabel}
        onDismiss={() => {
          instructionsOpenRef.current = false;
          setInstructionsOpen(false);
          inputRef.current = {
            left: false,
            right: false,
            down: false,
            jumpPressed: false,
            tonguePressed: false,
            rainbowPressed: false,
            pausePressed: false,
          };
        }}
      />

      <RainbowCowboyControls
        disabled={paused || instructionsOpen}
        attackLabel={rideConfig.attackLabel}
        specialLabel={rideConfig.specialLabel}
        onLeft={(active) => {
          inputRef.current.left = active;
        }}
        onRight={(active) => {
          inputRef.current.right = active;
        }}
        onDuck={(active) => {
          inputRef.current.down = active;
        }}
        onJump={() => {
          inputRef.current.jumpPressed = true;
        }}
        onTongue={() => {
          inputRef.current.tonguePressed = true;
        }}
        onRainbow={() => {
          inputRef.current.rainbowPressed = true;
        }}
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
          <div style={{ marginBottom: 16 }}>PAUSED — Esc to resume</div>
          <div style={{ width: "min(280px, 90vw)" }}>
            <UnicornHeroAudioControls
              prefs={audioPrefs}
              onChange={syncAudioPrefs}
              onInteract={() => void audioRef.current?.init()}
            />
          </div>
        </div>
      )}

      <div
        className="rc-landscape-hint"
        style={{
          display: "none",
          position: "absolute",
          inset: 0,
          zIndex: 40,
          background: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
          color: "#fff",
          fontFamily: "monospace",
          fontSize: 16,
          pointerEvents: "none",
        }}
      >
        Rotate to landscape for the best ride 🦄
      </div>

      <style>{`
        @media (max-width: 900px) {
          .rainbow-cowboy-game-shell {
            position: fixed !important;
            inset: 0 !important;
            width: 100vw !important;
            height: 100dvh !important;
            z-index: 200;
          }
        }
        @media (max-width: 900px) and (orientation: portrait) {
          .rc-landscape-hint { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
