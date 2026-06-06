"use client";

import { useEffect, useRef } from "react";
import type { RenderSafeEncounter, RenderSafeEncounterRunState } from "./renderSafeTypes";
import {
  drawAssaultSprite,
  drawAtmosphereOverlay,
  drawChemlightAmbient,
  drawChemlightGlow,
  drawEnhancedTile,
  drawGroundShadow,
  drawPlayerSprite,
} from "./renderSafeGraphics";
import type { PlayerFacing } from "./renderSafeGraphics";
import { RenderSafeParticlePool } from "./renderSafeParticles";
import {
  MAP_COLS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  encounterToTile,
  getRockSpots,
  getTile,
} from "./renderSafeMap";
import { isPathLike } from "./renderSafeAutotile";

export interface ChemlightMarker {
  col: number;
  row: number;
}

interface Props {
  playerX: number;
  playerY: number;
  followers: Array<{ x: number; y: number }>;
  encounters: RenderSafeEncounter[];
  getEncounterState: (id: string) => RenderSafeEncounterRunState;
  chemlights: ChemlightMarker[];
  targetReached: boolean;
  finishPulse: number;
  onEncounterClick: (encounter: RenderSafeEncounter) => void;
  displayScale: number;
  cameraY: number;
  viewportHeight?: number;
  playerFacing?: PlayerFacing;
  mapSeed?: number;
  fillContainer?: boolean;
}

function drawEncounterCue(
  ctx: CanvasRenderingContext2D,
  encounter: RenderSafeEncounter,
  col: number,
  row: number,
  state: RenderSafeEncounterRunState,
  time: number,
) {
  const cx = col * TILE_SIZE + TILE_SIZE / 2;
  const cy = row * TILE_SIZE + TILE_SIZE / 2;
  const isDecoy = encounter.optionalDecoy === true;
  const pulse = 0.9 + Math.sin(time / 300 + col) * 0.08;

  if (state.resolved) {
    ctx.fillStyle = "rgba(34,197,94,0.22)";
    ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    return;
  }

  drawGroundShadow(ctx, cx, cy + 2, 0.9);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.globalAlpha = isDecoy ? 0.5 : 1;

  switch (encounter.type) {
    case "disturbed_earth": {
      ctx.fillStyle = "#5a4428";
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a5c38";
      ctx.beginPath();
      ctx.ellipse(0, 1, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2818";
      ctx.fillRect(-2, 2, 4, 2);
      break;
    }
    case "suspicious_wire": {
      ctx.strokeStyle = "#0f0f0f";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, 5);
      ctx.lineTo(0, 1);
      ctx.lineTo(11, -3);
      ctx.stroke();
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(9, -5, 3, 3);
      ctx.strokeStyle = "rgba(200,200,200,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-11, 4);
      ctx.lineTo(11, -4);
      ctx.stroke();
      break;
    }
    case "abandoned_item": {
      ctx.fillStyle = "#1a1814";
      ctx.fillRect(-8, -5, 16, 11);
      ctx.fillStyle = "#3a3530";
      ctx.fillRect(-6, -3, 12, 7);
      ctx.fillStyle = "#252220";
      ctx.fillRect(-4, 0, 8, 3);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(-5, -2, 4, 2);
      break;
    }
    case "choke_point": {
      ctx.fillStyle = "#5a4428";
      ctx.fillRect(-6, 3, 12, 5);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(-12, -9, 5, 18);
      ctx.fillRect(7, -9, 5, 18);
      ctx.fillStyle = "#555";
      ctx.fillRect(-11, -9, 3, 3);
      ctx.fillRect(8, -9, 3, 3);
      break;
    }
    case "bridge_crossing": {
      ctx.fillStyle = "#5a4428";
      ctx.beginPath();
      ctx.ellipse(0, 4, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      break;
    }
    case "trip_wire": {
      ctx.strokeStyle = "#141414";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-12, 3);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(-12, 1, 3, 3);
      ctx.fillStyle = "#4a3020";
      ctx.fillRect(9, -4, 4, 5);
      ctx.strokeStyle = "rgba(239,68,68,0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(-12, 3);
      ctx.lineTo(12, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    default:
      ctx.fillStyle = "#f97316";
      ctx.fillRect(-5, -5, 10, 10);
  }

  if (state.investigated && state.isThreat) {
    ctx.strokeStyle = "rgba(239,68,68,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-10, -10, 20, 20);
  } else if (!state.resolved && !isDecoy) {
    const ping = 12 + Math.sin(time / 380 + row * 0.5) * 2.5;
    ctx.strokeStyle = `rgba(249,115,22,${0.35 + Math.sin(time / 260) * 0.15})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ping, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(249,115,22,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTargetBanner(
  ctx: CanvasRenderingContext2D,
  cameraY: number,
  viewportHeight: number,
  time: number,
  pulse: number,
) {
  const bannerY = cameraY + viewportHeight * 0.28;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, bannerY, MAP_WIDTH, viewportHeight * 0.32);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f97316";
  ctx.font = "bold 14px monospace";
  ctx.fillText("TARGET REACHED", MAP_WIDTH / 2, bannerY + viewportHeight * 0.1);
  ctx.fillStyle = "#e8e8e8";
  ctx.font = "11px monospace";
  ctx.fillText("The assault force made it to the building.", MAP_WIDTH / 2, bannerY + viewportHeight * 0.18);

  const targetY = cameraY + 36;
  const ring = 22 + pulse * 16;
  ctx.strokeStyle = `rgba(249,115,22,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(MAP_WIDTH / 2, targetY, ring, 0, Math.PI * 2);
  ctx.stroke();
}

export function RenderSafeMapCanvas({
  playerX,
  playerY,
  followers,
  encounters,
  getEncounterState,
  chemlights,
  targetReached,
  finishPulse,
  onEncounterClick,
  displayScale,
  cameraY,
  viewportHeight = VIEWPORT_HEIGHT,
  playerFacing = "up",
  mapSeed = 1,
  fillContainer = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clickHandlerRef = useRef(onEncounterClick);
  clickHandlerRef.current = onEncounterClick;
  const particlesRef = useRef<RenderSafeParticlePool | null>(null);
  if (!particlesRef.current) particlesRef.current = new RenderSafeParticlePool();
  const prevPlayerRef = useRef({ x: playerX, y: playerY });
  const lastFrameRef = useRef(0);

  const cssWidth = fillContainer ? "100%" : MAP_WIDTH * displayScale;
  const cssHeight = fillContainer ? "100%" : viewportHeight * displayScale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = MAP_WIDTH * dpr;
    canvas.height = viewportHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    const draw = (time: number) => {
      const dt = lastFrameRef.current ? Math.min(32, time - lastFrameRef.current) : 16;
      lastFrameRef.current = time;
      const particles = particlesRef.current!;

      const moved = Math.hypot(playerX - prevPlayerRef.current.x, playerY - prevPlayerRef.current.y);
      if (moved > 0.6 && !targetReached) {
        const col = Math.floor(playerX / TILE_SIZE);
        const row = Math.floor(playerY / TILE_SIZE);
        const tile = getTile(col, row);
        if (isPathLike(tile) || tile === "grass" || tile === "brush") {
          particles.spawnDust(playerX, playerY);
        }
        if (tile === "water" || getTile(col, row + 1) === "water" || getTile(col, row - 1) === "water") {
          particles.spawnRipple(playerX, playerY + 4);
        }
      }
      prevPlayerRef.current = { x: playerX, y: playerY };
      particles.tick(dt);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, MAP_WIDTH, viewportHeight);

      ctx.save();
      ctx.translate(0, -cameraY);

      ctx.fillStyle = "#060a08";
      ctx.fillRect(0, cameraY, MAP_WIDTH, viewportHeight);

      const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
      const endRow = Math.min(MAP_ROWS, Math.ceil((cameraY + viewportHeight) / TILE_SIZE) + 1);

      for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < MAP_COLS; col++) {
          drawEnhancedTile(ctx, col, row, getTile(col, row), time);
        }
      }

      for (const [col, row] of getRockSpots()) {
        if (row >= startRow && row < endRow && getTile(col, row) === "grass") {
          drawEnhancedTile(ctx, col, row, "rock", time);
        }
      }

      for (const cl of chemlights) {
        if (cl.row >= startRow && cl.row < endRow) {
          const cx = cl.col * TILE_SIZE + TILE_SIZE / 2;
          const cy = cl.row * TILE_SIZE + TILE_SIZE / 2;
          drawChemlightGlow(ctx, cx, cy, time);
        }
      }

      drawChemlightAmbient(ctx, chemlights, startRow, endRow, time);

      for (const enc of encounters) {
        if (enc.type === "target_building") continue;
        const { col, row } = encounterToTile(enc);
        if (row >= startRow && row < endRow) {
          drawEncounterCue(ctx, enc, col, row, getEncounterState(enc.id), time);
        }
      }

      followers.forEach((f, i) => {
        drawAssaultSprite(ctx, f.x, f.y, 0.86 - i * 0.04, time, playerFacing);
      });

      drawPlayerSprite(ctx, playerX, playerY, time, playerFacing);

      particles.draw(ctx, cameraY, viewportHeight);

      if (targetReached) {
        drawTargetBanner(ctx, cameraY, viewportHeight, time, finishPulse);
      }

      ctx.restore();

      drawAtmosphereOverlay(ctx, MAP_WIDTH, viewportHeight);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [
    playerX,
    playerY,
    followers,
    encounters,
    chemlights,
    targetReached,
    finishPulse,
    getEncounterState,
    cameraY,
    viewportHeight,
    playerFacing,
    mapSeed,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * MAP_WIDTH;
      const py = cameraY + ((e.clientY - rect.top) / rect.height) * viewportHeight;

      for (const enc of encounters) {
        if (enc.type === "target_building") continue;
        const { col, row } = encounterToTile(enc);
        const cx = col * TILE_SIZE + TILE_SIZE / 2;
        const cy = row * TILE_SIZE + TILE_SIZE / 2;
        if (Math.hypot(px - cx, py - cy) < TILE_SIZE * 0.95) {
          clickHandlerRef.current(enc);
          break;
        }
      }
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [encounters, cameraY, viewportHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH}
      height={viewportHeight}
      style={{
        width: cssWidth,
        height: cssHeight,
        imageRendering: "pixelated",
        display: "block",
        touchAction: "none",
        ...(fillContainer
          ? { position: "absolute", inset: 0 }
          : {}),
      }}
    />
  );
}
