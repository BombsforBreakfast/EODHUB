"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VIEW_H, VIEW_W } from "./rainbowCowboyConstants";
import { RainbowCowboyEngine, RAINBOW_COWBOY_ENGINE_REVISION, type GameInput } from "./rainbowCowboyEngine";
import { drawWorld, maybeSpawnDust } from "./rainbowCowboyGraphics";
import { RainbowCowboyParticlePool } from "./rainbowCowboyParticles";
import type { LevelConfig } from "./rainbowCowboyTypes";
import type { RainbowCowboyHudSnapshot, RainbowCowboyRunResult } from "./rainbowCowboyTypes";
import { RainbowCowboyControls } from "./RainbowCowboyControls";
import { RainbowCowboyHud } from "./RainbowCowboyHud";

interface Props {
  config: LevelConfig;
  personalBest: number | null;
  onComplete: (result: RainbowCowboyRunResult) => void;
  onGameOver: (result: RainbowCowboyRunResult) => void;
  onExit: () => void;
}

const defaultHud: RainbowCowboyHudSnapshot = {
  hearts: 5,
  maxHearts: 5,
  score: 0,
  rainbowCharges: 0,
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
    typeof engine.prevPlayerX !== "number"
  );
}

export function RainbowCowboyGame({
  config,
  personalBest,
  onComplete,
  onGameOver,
  onExit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RainbowCowboyEngine | null>(null);
  const inputRef = useRef<GameInput>({
    left: false,
    right: false,
    jumpPressed: false,
    tonguePressed: false,
    rainbowPressed: false,
    pausePressed: false,
  });
  const endedRef = useRef(false);
  const particlesRef = useRef<RainbowCowboyParticlePool | null>(null);
  const prevPosRef = useRef({ x: 0, y: 0 });
  const engineRevisionRef = useRef(RAINBOW_COWBOY_ENGINE_REVISION);
  const [hud, setHud] = useState(defaultHud);
  const [paused, setPaused] = useState(false);

  if (!particlesRef.current) particlesRef.current = new RainbowCowboyParticlePool();

  useEffect(() => {
    const engine = new RainbowCowboyEngine(config);
    engineRef.current = engine;
    engineRevisionRef.current = RAINBOW_COWBOY_ENGINE_REVISION;
    endedRef.current = false;
    prevPosRef.current = { x: engine.playerX, y: engine.playerY };
    particlesRef.current?.tick(9999);
    setHud(defaultHud);
    setPaused(false);
  }, [config]);

  const consumeEdgeInputs = useCallback(() => {
    const input = inputRef.current;
    const edge = {
      left: input.left,
      right: input.right,
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
      last = now;

      const input = consumeEdgeInputs();
      engine.tick(dt, input);

      if (engine.phase === "paused") {
        setPaused(true);
      } else {
        setPaused(false);
      }

      const nextHud = engine.getHud();
      setHud((prev) =>
        prev.score === nextHud.score &&
        prev.hearts === nextHud.hearts &&
        prev.status === nextHud.status &&
        prev.rainbowCharges === nextHud.rainbowCharges &&
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
      const k = e.key.toLowerCase();
      const input = inputRef.current;
      if (k === "a" || k === "arrowleft") input.left = true;
      if (k === "d" || k === "arrowright") input.right = true;
      if (k === " " || k === "arrowup" || k === "w") {
        e.preventDefault();
        input.jumpPressed = true;
      }
      if (k === "r") input.tonguePressed = true;
      if (k === "e") input.rainbowPressed = true;
      if (k === "escape") input.pausePressed = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const input = inputRef.current;
      if (k === "a" || k === "arrowleft") input.left = false;
      if (k === "d" || k === "arrowright") input.right = false;
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

      <RainbowCowboyHud hud={hud} personalBest={personalBest} levelTitle={config.level.title} />

      <RainbowCowboyControls
        disabled={paused}
        onLeft={(active) => {
          inputRef.current.left = active;
        }}
        onRight={(active) => {
          inputRef.current.right = active;
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
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            fontSize: 28,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          PAUSED — Esc to resume
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
