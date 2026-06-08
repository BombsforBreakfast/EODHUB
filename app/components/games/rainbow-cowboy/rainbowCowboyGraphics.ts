import {
  BALLOON_SIZE,
  DYNAMITE_RADIUS,
  DYNAMITE_SIZE,
  GROUND_TILE,
  LANDMINE_EXPLODE_MS,
  NEST_H,
  NEST_W,
  PICKUP_SIZE,
  PLAYER_H,
  PLAYER_W,
  VIEW_H,
  VIEW_W,
} from "./rainbowCowboyConstants";
import type { RainbowCowboyEngine } from "./rainbowCowboyEngine";
import { getRideExtractionLine } from "../unicorn-hero/unicornHeroRides";
import type { LevelConfig } from "./rainbowCowboyTypes";
import type { RainbowCowboyParticlePool } from "./rainbowCowboyParticles";

let cachedNoise: CanvasPattern | null = null;

function getNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (cachedNoise) return cachedNoise;
  if (typeof document === "undefined") return null;
  const size = 32;
  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const img = octx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = ((i / 4) * 1103515245 + 12345) & 0xff;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  cachedNoise = ctx.createPattern(off, "repeat");
  return cachedNoise;
}

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function tileVariant(col: number): number {
  return (col * 17 + 31) % 3;
}

function worldHash(x: number): number {
  return ((x * 2654435761) >>> 0) % 1000;
}

function drawGroundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w = 28) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, w * 0.45, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawParallaxSky(ctx: CanvasRenderingContext2D, camX: number, time: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#4a90c8");
  grad.addColorStop(0.45, "#7ec8e8");
  grad.addColorStop(0.72, "#b8e0a0");
  grad.addColorStop(1, "#68a848");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Far mountains
  ctx.fillStyle = "#5a6898";
  for (let i = -1; i < 8; i++) {
    const base = i * 280 - (camX * 0.08) % 280;
    ctx.beginPath();
    ctx.moveTo(base - 40, VIEW_H * 0.55);
    ctx.lineTo(base + 80, VIEW_H * 0.28);
    ctx.lineTo(base + 200, VIEW_H * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // Mid hills
  ctx.fillStyle = "#4a8a48";
  for (let i = -1; i < 10; i++) {
    const base = i * 200 - (camX * 0.18) % 200;
    ctx.beginPath();
    ctx.moveTo(base, VIEW_H * 0.62);
    ctx.quadraticCurveTo(base + 60, VIEW_H * 0.42, base + 140, VIEW_H * 0.62);
    ctx.fill();
  }

  // Clouds
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 260 - camX * 0.12 + time * 0.008) % (VIEW_W + 160)) - 80;
    const cy = 36 + (i % 4) * 22;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 22, cy + 4, 26, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 18, cy + 2, 20, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCanyonSky(ctx: CanvasRenderingContext2D, camX: number, time: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#6a3828");
  grad.addColorStop(0.35, "#c87848");
  grad.addColorStop(0.65, "#e8a868");
  grad.addColorStop(1, "#8a5840");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Canyon walls (parallax)
  ctx.fillStyle = "#5a3428";
  for (let i = -1; i < 6; i++) {
    const base = i * 420 - (camX * 0.05) % 420;
    ctx.beginPath();
    ctx.moveTo(base - 60, VIEW_H);
    ctx.lineTo(base + 40, VIEW_H * 0.35);
    ctx.lineTo(base + 120, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#4a2818";
  for (let i = -1; i < 6; i++) {
    const base = i * 380 - (camX * 0.12) % 380 + 200;
    ctx.beginPath();
    ctx.moveTo(base, VIEW_H);
    ctx.lineTo(base + 80, VIEW_H * 0.42);
    ctx.lineTo(base + 160, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  // Distant mesas
  ctx.fillStyle = "#7a4838";
  for (let i = -1; i < 8; i++) {
    const base = i * 260 - (camX * 0.08) % 260;
    ctx.beginPath();
    ctx.moveTo(base, VIEW_H * 0.58);
    ctx.lineTo(base + 70, VIEW_H * 0.38);
    ctx.lineTo(base + 150, VIEW_H * 0.58);
    ctx.fill();
  }
}

function drawCanyonGroundLayer(ctx: CanvasRenderingContext2D, config: LevelConfig, camX: number) {
  const groundY = config.level.groundY;
  const levelW = config.level.levelWidth;
  const startCol = Math.floor(camX / GROUND_TILE) - 1;
  const endCol = Math.ceil((camX + VIEW_W) / GROUND_TILE) + 1;

  for (let col = startCol; col <= endCol; col++) {
    for (let row = Math.floor(groundY / GROUND_TILE); row < Math.ceil(VIEW_H / GROUND_TILE); row++) {
      const x = col * GROUND_TILE - camX;
      const y = row * GROUND_TILE;
      const v = tileVariant(col);
      const bases = ["#8a5840", "#946040", "#7a5038"];
      px(ctx, x, y, GROUND_TILE, GROUND_TILE, bases[v]);
      px(ctx, x + 2, y + 2, GROUND_TILE - 4, GROUND_TILE - 4, "#a06848");
    }
  }

  px(ctx, -camX, groundY, levelW, 8, "#6a4030");
  px(ctx, -camX, groundY + 8, levelW, 6, "#4a2818");

  // Scattered rocks
  const startCol2 = Math.floor(camX / GROUND_TILE) - 2;
  const endCol2 = Math.ceil((camX + VIEW_W) / GROUND_TILE) + 2;
  for (let col = startCol2; col <= endCol2; col++) {
    const wx = col * GROUND_TILE;
    if (wx < 0 || wx > levelW) continue;
    const h = worldHash(wx);
    const sx = wx - camX;
    if (h % 23 === 0) {
      px(ctx, sx + 2, groundY - 8, 12, 8, "#5a4030");
      px(ctx, sx + 4, groundY - 10, 8, 4, "#6a5040");
    }
    if (h % 31 === 0) {
      px(ctx, sx + 8, groundY - 22, 3, 14, "#7a5030");
      ctx.fillStyle = "#e04040";
      ctx.font = "8px monospace";
      ctx.fillText("!", sx + 7, groundY - 24);
    }
  }
}

function drawCanyonPlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#6a4838");
  px(ctx, sx, y, w, 4, "#8a6048");
  px(ctx, sx, y + h - 4, w, 4, "#4a3020");
  for (let i = 0; i < w; i += 12) {
    px(ctx, sx + i, y + 4, 8, h - 8, "#5a3828");
  }
}

function drawCanyonWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#5a3428");
  for (let row = 0; row < h; row += 10) {
    px(ctx, sx + 2, y + row, w - 4, 8, "#6a4438");
    px(ctx, sx + 4, y + row + 2, w - 8, 4, "#7a5448");
  }
}

function drawCanyonExtraction(
  ctx: CanvasRenderingContext2D,
  exX: number,
  groundY: number,
  camX: number,
  time: number,
) {
  const sx = exX - camX;
  px(ctx, sx - 48, groundY - 4, 96, 8, "#4a4038");

  // Beacon pad
  ctx.strokeStyle = "#f0e040";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, groundY - 22, 30, 0, Math.PI * 2);
  ctx.stroke();

  // Helicopter body
  const hover = Math.sin(time / 300) * 3;
  px(ctx, sx - 28, groundY - 90 + hover, 56, 16, "#4a6858");
  px(ctx, sx - 12, groundY - 98 + hover, 24, 10, "#5a7868");
  px(ctx, sx - 40, groundY - 86 + hover, 80, 4, "#3a4838");
  px(ctx, sx + 30, groundY - 82 + hover, 16, 8, "#68c8f0");
  const blink = Math.sin(time / 350) > 0;
  if (blink) {
    ctx.fillStyle = "#80ff80";
    ctx.beginPath();
    ctx.arc(sx + 34, groundY - 78 + hover, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("EXTRACTION", sx, groundY - 108 + hover);
  ctx.textAlign = "left";
}

function drawAlamoSky(ctx: CanvasRenderingContext2D, camX: number, time: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#1a2030");
  grad.addColorStop(0.45, "#3a2830");
  grad.addColorStop(1, "#5a4038");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (let i = 0; i < 5; i++) {
    const sx = ((i * 220 - camX * 0.08) % (VIEW_W + 120)) - 60;
    const sy = 40 + i * 18 + Math.sin(time / 900 + i) * 6;
    ctx.fillStyle = "rgba(255,120,80,0.08)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, 90, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAlamoGroundLayer(ctx: CanvasRenderingContext2D, config: LevelConfig, camX: number) {
  const groundY = config.level.groundY;
  const levelW = config.level.levelWidth;
  const startCol = Math.floor(camX / GROUND_TILE) - 1;
  const endCol = Math.ceil((camX + VIEW_W) / GROUND_TILE) + 1;
  const startRow = Math.floor(groundY / GROUND_TILE);

  for (let col = startCol; col <= endCol; col++) {
    for (let row = startRow; row < Math.ceil(VIEW_H / GROUND_TILE); row++) {
      const sx = col * GROUND_TILE - camX;
      const sy = row * GROUND_TILE;
      px(ctx, sx, sy, GROUND_TILE, GROUND_TILE, row === startRow ? "#6a5848" : "#4a4038");
      px(ctx, sx + 2, sy + 2, GROUND_TILE - 4, GROUND_TILE - 4, row === startRow ? "#7a6858" : "#5a5040");
    }
  }

  px(ctx, -camX, groundY, levelW, 6, "#4a3830");
  px(ctx, -camX, groundY + 6, levelW, 4, "#2a2018");

  for (let x = 200; x < levelW; x += 280) {
    const sx = x - camX;
    if (sx < -80 || sx > VIEW_W + 80) continue;
    px(ctx, sx, groundY - 48, 8, 48, "#5a5048");
    px(ctx, sx - 12, groundY - 56, 32, 8, "#6a6058");
    px(ctx, sx - 8, groundY - 64, 24, 8, "#7a7068");
  }
}

function drawAlamoPlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#5a5048");
  px(ctx, sx + 2, y + 2, w - 4, h - 4, "#6a6058");
  px(ctx, sx, y - 4, w, 4, "#4a4038");
}

function drawAlamoWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#3a3028");
  px(ctx, sx + 3, y + 3, w - 6, h - 6, "#4a4038");
  px(ctx, sx + 6, y + 8, w - 12, 4, "#2a2018");
  px(ctx, sx + 6, y + h - 14, w - 12, 4, "#2a2018");
}

function drawAlamoExtraction(
  ctx: CanvasRenderingContext2D,
  exX: number,
  groundY: number,
  camX: number,
  time: number,
) {
  const sx = exX - camX;
  px(ctx, sx - 56, groundY - 8, 112, 8, "#4a4038");
  px(ctx, sx - 52, groundY - 72, 104, 64, "#5a4838");
  px(ctx, sx - 48, groundY - 68, 96, 56, "#6a5848");
  px(ctx, sx - 40, groundY - 64, 24, 48, "#3a3028");
  px(ctx, sx + 16, groundY - 64, 24, 48, "#3a3028");
  px(ctx, sx - 8, groundY - 40, 16, 32, "#2a2018");
  px(ctx, sx - 60, groundY - 56, 8, 40, "#4a4038");
  px(ctx, sx + 52, groundY - 56, 8, 40, "#4a4038");
  px(ctx, sx - 64, groundY - 20, 128, 12, "#7a7068");

  const blink = Math.sin(time / 350) > 0;
  if (blink) {
    ctx.fillStyle = "#80ff80";
    ctx.beginPath();
    ctx.arc(sx + 38, groundY - 78, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("ALAMO EXTRACTION", sx, groundY - 88);
  ctx.textAlign = "left";
}

function drawMonsterTruckWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  time: number,
) {
  px(ctx, cx - r, cy - r, r * 2, r * 2, "#1a1a1a");
  px(ctx, cx - r + 2, cy - r + 2, r * 2 - 4, r * 2 - 4, "#2a2a2a");
  const spoke = Math.floor(time / 90) % 2;
  px(ctx, cx - 2, cy - r + 3, 4, r * 2 - 6, spoke ? "#444" : "#333");
  px(ctx, cx - r + 3, cy - 2, r * 2 - 6, 4, spoke ? "#333" : "#444");
  px(ctx, cx - 3, cy - 3, 6, 6, "#555");
}

function drawMonsterTruck(
  ctx: CanvasRenderingContext2D,
  sx: number,
  y: number,
  w: number,
  h: number,
  time: number,
  variant: "basic" | "turret" | "grenade",
  hp?: number,
  maxHp?: number,
  beepPhase?: number,
  turretAngle = 0,
) {
  const wheelR = variant === "turret" ? 11 : 10;
  const leftWheelX = sx + 10 + wheelR;
  const rightWheelX = sx + w - 10 - wheelR;
  const wheelY = y + h - wheelR - 1;

  drawMonsterTruckWheel(ctx, leftWheelX, wheelY, wheelR, time);
  drawMonsterTruckWheel(ctx, rightWheelX, wheelY, wheelR, time);

  const bodyColor = variant === "turret" ? "#3a4858" : "#4a5868";
  const cabColor = variant === "turret" ? "#506070" : "#607080";
  const trim = variant === "grenade" ? "#5a6840" : "#788898";

  px(ctx, sx + 6, y + h - wheelR - 16, w - 12, 14, bodyColor);
  px(ctx, sx + 8, y + h - wheelR - 14, w - 16, 10, trim);
  px(ctx, sx + 10, y + 8, w - 20, 14, cabColor);
  px(ctx, sx + 12, y + 10, w - 24, 10, bodyColor);

  // Roll cage bars
  px(ctx, sx + 14, y + 6, 2, 10, "#8898a8");
  px(ctx, sx + w - 16, y + 6, 2, 10, "#8898a8");
  px(ctx, sx + 16, y + 4, w - 32, 2, "#8898a8");

  const blink = Math.sin(time / 130 + (beepPhase ?? 0)) > 0.25;
  if (blink) {
    ctx.fillStyle = "rgba(255,40,40,0.95)";
    ctx.fillRect(sx + w / 2 - 3, y + 1, 6, 6);
    ctx.fillStyle = "rgba(255,120,120,0.45)";
    ctx.fillRect(sx + w / 2 - 6, y - 2, 12, 12);
  } else {
    px(ctx, sx + w / 2 - 2, y + 2, 4, 4, "#601818");
  }

  if (variant === "turret") {
    const pivotX = sx + w / 2;
    const pivotY = y + 12;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(turretAngle);
    px(ctx, -4, -5, 8, 10, "#3a4048");
    px(ctx, -2, -3, 4, 6, "#505860");
    px(ctx, 2, -2, 14, 4, "#404850");
    px(ctx, 14, -3, 6, 6, "#303840");
    ctx.fillStyle = "#f04040";
    ctx.fillRect(18, -1, 3, 2);
    ctx.restore();
  }

  if (variant === "grenade") {
    px(ctx, sx + w - 18, y + 6, 10, 12, "#3a4830");
    px(ctx, sx + w - 16, y + 8, 6, 8, "#4a5840");
    px(ctx, sx + 6, y + 14, 8, 6, "#505840");
    px(ctx, sx + 8, y + 15, 4, 4, "#809060");
    const arc = Math.sin(time / 200 + (beepPhase ?? 0));
    if (arc > 0) {
      px(ctx, sx + w - 14, y + 2, 4, 4, "#f0d040");
    }
  }

  if (variant === "turret") {
    px(ctx, sx + 4, y + h - wheelR - 18, w - 8, 4, "#2a3038");
    px(ctx, sx + 6, y + h - wheelR - 20, 8, 6, "#3a4048");
    px(ctx, sx + w - 14, y + h - wheelR - 20, 8, 6, "#3a4048");
  }

  if (hp != null && maxHp != null && maxHp > 1) {
    px(ctx, sx + 4, y - 6, w - 8, 4, "#1a1818");
    const fillW = Math.max(0, Math.round(((w - 8) * hp) / maxHp));
    px(ctx, sx + 4, y - 6, fillW, 4, "#60c8ff");
  }
}

function drawEnemyBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
) {
  const sx = x - camX;
  ctx.fillStyle = "#ff6040";
  ctx.fillRect(sx - 4, y - 2, 8, 4);
  ctx.fillStyle = "#ffe080";
  ctx.fillRect(sx + 1, y - 1, 4, 2);
}

function drawRocketArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: 1 | -1,
  scale = 1,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(dir * scale, scale);
  // Tail fins
  px(ctx, -16, -5, 5, 4, "#3a3028");
  px(ctx, -16, 1, 5, 4, "#3a3028");
  px(ctx, -14, -7, 4, 3, "#4a4030");
  px(ctx, -14, 4, 4, 3, "#4a4030");
  // Exhaust glow
  px(ctx, -18, -2, 4, 4, "#f08030");
  px(ctx, -20, -1, 3, 2, "#ffc060");
  // Body
  px(ctx, -14, -3, 28, 6, "#5a5038");
  px(ctx, -12, -2, 24, 4, "#7a6848");
  // Warhead band
  px(ctx, 2, -4, 8, 8, "#802828");
  px(ctx, 4, -3, 6, 6, "#a03030");
  // Arrow nose
  px(ctx, 8, -4, 6, 8, "#908070");
  px(ctx, 12, -3, 5, 6, "#c04830");
  px(ctx, 15, -2, 4, 4, "#f06030");
  px(ctx, 17, -1, 3, 2, "#ffe080");
  ctx.restore();
}

function drawBlasterProjectile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  weapon: "pistol" | "machine_gun" | "bazooka" = "pistol",
  dir: 1 | -1 = 1,
) {
  const sx = x - camX;
  if (weapon === "bazooka") {
    drawRocketArrow(ctx, sx, y, dir, 1);
    ctx.fillStyle = "rgba(255,120,40,0.35)";
    ctx.beginPath();
    ctx.arc(sx - dir * 18, y, 8, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const w = weapon === "machine_gun" ? 12 : 16;
  const h = weapon === "machine_gun" ? 4 : 6;
  ctx.fillStyle = weapon === "machine_gun" ? "#ffe060" : "#80f0ff";
  ctx.fillRect(sx - w / 2, y - h / 2, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(sx + 2, y - 1, weapon === "machine_gun" ? 4 : 6, 2);
  ctx.fillStyle = weapon === "machine_gun" ? "rgba(255,220,80,0.35)" : "rgba(120,240,255,0.35)";
  ctx.beginPath();
  ctx.arc(sx - 6, y, weapon === "machine_gun" ? 6 : 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawBlasterMuzzle(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
  weapon?: "pistol" | "machine_gun" | "bazooka",
) {
  const dir = engine.facing === "right" ? 1 : -1;
  const cx = engine.playerX - camX + dir * 28;
  const cy = engine.playerY - (engine.isDucking ? 34 : 40);
  if (weapon === "bazooka") {
    px(ctx, cx + dir * 4, cy - 4, dir * 22, 8, "#5a4030");
    px(ctx, cx + dir * 8, cy - 2, dir * 14, 4, "#806040");
    ctx.fillStyle = "#ff8040";
    ctx.fillRect(cx + dir * 20, cy - 3, dir * 10, 6);
    return;
  }
  const color = weapon === "machine_gun" ? "#ffe060" : "#80f0ff";
  ctx.fillStyle = color;
  ctx.fillRect(cx, cy - 2, dir * 18, 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(cx + dir * 12, cy - 1, dir * 6, 2);
}

function drawGrassTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  groundY: number,
) {
  if (y < groundY) return;
  const v = tileVariant(col);
  const bases = ["#4a8a3c", "#528f42", "#468038"];
  const mids = ["#5a9a48", "#62a450", "#569a40"];
  px(ctx, x, y, GROUND_TILE, GROUND_TILE, bases[v]);
  px(ctx, x + 2, y + 2, GROUND_TILE - 4, GROUND_TILE - 4, mids[v]);
  if (v === 1) px(ctx, x + 4, y + 3, 3, 3, "#3d7030");
  if (v === 2) px(ctx, x + 8, y + 8, 2, 2, "#3d7030");

  const pattern = getNoisePattern(ctx);
  if (pattern) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, GROUND_TILE, GROUND_TILE);
    ctx.restore();
  }
}

function drawGroundDecor(
  ctx: CanvasRenderingContext2D,
  camX: number,
  groundY: number,
  levelW: number,
) {
  const startCol = Math.floor(camX / GROUND_TILE) - 2;
  const endCol = Math.ceil((camX + VIEW_W) / GROUND_TILE) + 2;

  for (let col = startCol; col <= endCol; col++) {
    const wx = col * GROUND_TILE;
    if (wx < 0 || wx > levelW) continue;
    const h = worldHash(wx);
    const sx = wx - camX;
    const gy = groundY + 4;

    if (h % 19 === 0) {
      px(ctx, sx + 4, gy - 10, 2, 8, "#3a7830");
      px(ctx, sx + 8, gy - 12, 2, 10, "#4a9040");
      px(ctx, sx + 12, gy - 8, 2, 7, "#3a7830");
    }
    if (h % 29 === 0) {
      px(ctx, sx + 2, gy - 2, 10, 6, "#6a6a6a");
      px(ctx, sx + 4, gy - 4, 6, 3, "#8a8a8a");
    }
    if (h % 41 === 0 && wx > 300) {
      px(ctx, sx + 6, gy - 28, 4, 28, "#8a6848");
      px(ctx, sx + 2, gy - 30, 12, 4, "#9a7858");
      px(ctx, sx + 4, gy - 34, 8, 4, "#5a9a40");
    }
    if (h % 37 === 0) {
      px(ctx, sx + 10, gy - 6, 4, 4, "#e8a030");
      px(ctx, sx + 11, gy - 8, 2, 2, "#ffe060");
    }
  }
}

function drawGroundLayer(ctx: CanvasRenderingContext2D, config: LevelConfig, camX: number) {
  const groundY = config.level.groundY;
  const levelW = config.level.levelWidth;
  const startCol = Math.floor(camX / GROUND_TILE) - 1;
  const endCol = Math.ceil((camX + VIEW_W) / GROUND_TILE) + 1;
  const startRow = Math.floor(groundY / GROUND_TILE);

  for (let col = startCol; col <= endCol; col++) {
    for (let row = startRow; row < Math.ceil(VIEW_H / GROUND_TILE); row++) {
      drawGrassTile(ctx, col * GROUND_TILE - camX, row * GROUND_TILE, col, groundY);
    }
  }

  px(ctx, -camX, groundY, levelW, 6, "#3a6828");
  px(ctx, -camX, groundY + 6, levelW, 4, "#2d5020");

  for (let x = 0; x < levelW; x += GROUND_TILE * 2) {
    const shade = (Math.floor(x / (GROUND_TILE * 2)) % 2 === 0) ? "#448038" : "#4a883c";
    px(ctx, x - camX, groundY + 10, GROUND_TILE * 2, 4, shade);
  }

  drawGroundDecor(ctx, camX, groundY, levelW);
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#6b4a28");
  px(ctx, sx, y, w, 4, "#8a6848");
  px(ctx, sx, y + h - 4, w, 4, "#3d2818");
  for (let i = 4; i < w - 4; i += 8) {
    px(ctx, sx + i, y + 6, 2, h - 10, "#5a3a20");
  }
  px(ctx, sx - 2, y - 4, w + 4, 6, "#5a9a48");
  px(ctx, sx, y - 2, w, 4, "#62a850");
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#5a5a68");
  for (let row = 0; row < h; row += 8) {
    for (let col = 0; col < w; col += 8) {
      const offset = (row / 8) % 2 === 0 ? 0 : 4;
      px(ctx, sx + col + offset, y + row, 7, 7, "#6a6a78");
      px(ctx, sx + col + offset + 1, y + row + 1, 5, 5, "#7a7a88");
    }
  }
  px(ctx, sx, y, w, 3, "#8a8a98");
}

function drawExtractionZone(
  ctx: CanvasRenderingContext2D,
  exX: number,
  groundY: number,
  camX: number,
  time: number,
) {
  const sx = exX - camX;
  px(ctx, sx - 48, groundY - 4, 96, 8, "#4a4a58");

  // Helipad
  px(ctx, sx - 36, groundY - 40, 72, 6, "#888898");
  ctx.strokeStyle = "#f0e040";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, groundY - 22, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(240,224,64,0.15)";
  ctx.fill();

  // Barn/shed
  px(ctx, sx - 44, groundY - 88, 88, 52, "#6a3828");
  px(ctx, sx - 40, groundY - 84, 80, 44, "#8a4838");
  px(ctx, sx - 48, groundY - 96, 96, 12, "#9a5848");
  px(ctx, sx - 8, groundY - 56, 16, 32, "#3a2818");
  px(ctx, sx + 20, groundY - 72, 12, 16, "#6ac8f0");

  const blink = Math.sin(time / 400) > 0;
  if (blink) {
    ctx.fillStyle = "#80ff80";
    ctx.beginPath();
    ctx.arc(sx + 26, groundY - 78, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("EXTRACTION", sx, groundY - 98);
  ctx.textAlign = "left";
}

function drawPickup(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  camX: number,
  time: number,
) {
  const sx = x - camX;
  const bob = Math.sin(time / 260) * 3;
  const py = y - PICKUP_SIZE + bob;
  drawGroundShadow(ctx, sx, y, 14);

  switch (kind) {
    case "range_beer":
      px(ctx, sx - 7, py, 14, 18, "#a08028");
      px(ctx, sx - 5, py + 2, 10, 12, "#d4b040");
      px(ctx, sx - 3, py + 6, 6, 5, "#f0d060");
      px(ctx, sx - 4, py - 5, 8, 5, "#888");
      px(ctx, sx - 2, py - 3, 4, 2, "#aaa");
      break;
    case "white_energy_drink":
      px(ctx, sx - 8, py, 16, 20, "#e0e0e0");
      px(ctx, sx - 6, py + 2, 12, 16, "#fff");
      px(ctx, sx - 5, py + 8, 10, 5, "#00c8f0");
      px(ctx, sx - 3, py + 9, 6, 3, "#0088c0");
      px(ctx, sx - 6, py - 2, 4, 3, "#ccc");
      break;
    case "nicotine_pouch":
      px(ctx, sx - 10, py + 4, 20, 14, "#f4f4f4");
      px(ctx, sx - 8, py + 6, 16, 10, "#e8e8e8");
      px(ctx, sx - 5, py + 8, 10, 5, "#2080f0");
      px(ctx, sx - 3, py + 9, 6, 3, "#1060c0");
      break;
    case "rainbow": {
      const bands = ["#e83838", "#e88820", "#e8e020", "#38b838", "#3868e8"];
      for (let i = 0; i < 5; i++) {
        px(ctx, sx - 10, py + 6 + i * 4, 20, 3, bands[i]);
      }
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(sx - 4, py + 2, 8, 4);
      break;
    }
    case "unicorn_treat":
      px(ctx, sx - 9, py + 8, 18, 10, "#7a4a20");
      px(ctx, sx - 7, py + 10, 14, 6, "#9a6830");
      for (let i = 0; i < 6; i++) {
        const sp = Math.sin(time / 100 + i * 1.2) * 3;
        ctx.fillStyle = ["#ff60ff", "#60ffff", "#ffff60", "#60ff60", "#ff9060", "#9060ff"][i];
        px(ctx, sx - 12 + i * 4, py + sp, 3, 3, ["#ff60ff", "#60ffff", "#ffff60", "#60ff60", "#ff9060", "#9060ff"][i]);
      }
      break;
    case "weapon_pistol":
      px(ctx, sx - 10, py + 2, 20, 14, "#284860");
      px(ctx, sx - 8, py + 4, 16, 10, "#386878");
      px(ctx, sx + 2, py + 6, 10, 4, "#80f0ff");
      px(ctx, sx - 6, py + 8, 6, 6, "#f0d040");
      ctx.fillStyle = `rgba(128,240,255,${0.35 + Math.sin(time / 180) * 0.2})`;
      ctx.fillRect(sx - 12, py - 2, 24, 18);
      break;
    case "weapon_machine_gun":
      px(ctx, sx - 12, py + 4, 24, 12, "#3a4048");
      px(ctx, sx - 10, py + 6, 20, 8, "#505860");
      px(ctx, sx - 4, py + 2, 8, 6, "#606870");
      px(ctx, sx + 4, py + 7, 12, 5, "#ffe060");
      ctx.fillStyle = `rgba(255,220,80,${0.35 + Math.sin(time / 120) * 0.2})`;
      ctx.fillRect(sx - 14, py, 28, 18);
      break;
    case "weapon_bazooka": {
      const bob = Math.sin(time / 220) * 2;
      drawRocketArrow(ctx, sx, py + 14 + bob, 1, 0.85);
      ctx.fillStyle = `rgba(255,100,40,${0.35 + Math.sin(time / 200) * 0.2})`;
      ctx.fillRect(sx - 20, py + 4 + bob, 40, 22);
      break;
    }
  }
}

function drawHazard(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  camX: number,
  time: number,
  timerMs?: number,
  timerMaxMs?: number,
  exploded?: boolean,
) {
  const sx = x - camX;

  if (kind === "landmine") {
    const gy = y;
    const pulse = 0.65 + Math.sin(time / 120) * 0.35;
    drawGroundShadow(ctx, sx, gy, 22);

    // Warning ring in the dirt
    ctx.strokeStyle = `rgba(255,60,40,${0.25 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(sx, gy - 2, 20, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Buried base — wider and darker
    px(ctx, sx - 19, gy - 10, 38, 8, "#141414");
    px(ctx, sx - 17, gy - 9, 34, 6, "#2a2a2a");
    px(ctx, sx - 14, gy - 8, 28, 5, "#404040");

    // Spiked pressure plate
    px(ctx, sx - 16, gy - 18, 32, 10, "#222");
    px(ctx, sx - 14, gy - 17, 28, 8, "#383838");
    for (let i = -2; i <= 2; i++) {
      px(ctx, sx + i * 7 - 2, gy - 24, 4, 7, "#555");
      px(ctx, sx + i * 7 - 1, gy - 26, 2, 4, "#888");
    }

    // Center dome + blinking trigger
    px(ctx, sx - 8, gy - 20, 16, 8, "#1a1a1a");
    px(ctx, sx - 6, gy - 19, 12, 6, "#505050");
    if (Math.sin(time / 140) > 0.2) {
      ctx.fillStyle = `rgba(255,${40 + pulse * 80},30,0.95)`;
      ctx.fillRect(sx - 3, gy - 18, 6, 4);
      ctx.fillStyle = "rgba(255,255,200,0.9)";
      ctx.fillRect(sx - 1, gy - 17, 2, 2);
    }

    // Skull warning marker
    ctx.fillStyle = `rgba(255,220,60,${0.55 + pulse * 0.25})`;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("☠", sx, gy - 30);
    ctx.textAlign = "left";
  }

  if (kind !== "landmine") {
    drawGroundShadow(ctx, sx, y, 12);
  }

  if (kind === "dynamite") {
    px(ctx, sx - 8, y - DYNAMITE_SIZE, 8, DYNAMITE_SIZE - 4, "#8b2020");
    px(ctx, sx, y - DYNAMITE_SIZE, 8, DYNAMITE_SIZE - 4, "#a02828");
    px(ctx, sx - 6, y - DYNAMITE_SIZE + 2, 12, DYNAMITE_SIZE - 8, "#c03838");
    px(ctx, sx - 1, y - DYNAMITE_SIZE - 8, 2, 10, "#aaa");
    ctx.fillStyle = "#ff8040";
    ctx.fillRect(sx - 2, y - DYNAMITE_SIZE - 10, 4, 3);
    if (timerMs != null && !exploded) {
      const sec = Math.ceil(timerMs / 1000);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(sec), sx, y - DYNAMITE_SIZE - 14);
      ctx.textAlign = "left";
      if (timerMs < 1200) {
        ctx.strokeStyle = `rgba(255,80,40,${0.35 + Math.sin(time / 70) * 0.25})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(sx, y - DYNAMITE_SIZE / 2, DYNAMITE_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (exploded) {
      const pulse = 0.5 + Math.sin(time / 40) * 0.2;
      ctx.fillStyle = `rgba(255,140,50,${pulse})`;
      ctx.beginPath();
      ctx.arc(sx, y - 18, DYNAMITE_RADIUS * 0.8, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, sx - 4, y - 22, 8, 8, "#ffe080");
    }
  }

  if (kind === "trash_balloon") {
    const py = y - BALLOON_SIZE.h;
    ctx.fillStyle = "#d0d0d0";
    ctx.beginPath();
    ctx.ellipse(sx, py + 16, 17, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8b8b8";
    ctx.beginPath();
    ctx.ellipse(sx - 4, py + 14, 8, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(60,180,80,0.4)";
    ctx.beginPath();
    ctx.ellipse(sx, py + 18, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, sx - 9, py + 34, 18, 14, "#3a3830");
    px(ctx, sx - 7, py + 36, 14, 10, "#4a4840");
    px(ctx, sx - 5, py + 38, 10, 6, "#68c848");
    ctx.strokeStyle = "#707070";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, py + 34);
    ctx.quadraticCurveTo(sx + 4, py + 44, sx, py + 48);
    ctx.stroke();
  }
}

function drawReconDrone(ctx: CanvasRenderingContext2D, sx: number, y: number, w: number, h: number, time: number) {
  const spin = time / 70;
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const rx = sx + w / 2 + Math.cos(a) * (w * 0.38);
    const ry = y + h / 2 + Math.sin(a) * (h * 0.35);
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, y + h / 2);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
  px(ctx, sx + w / 2 - 6, y + h / 2 - 5, 12, 10, "#585858");
  px(ctx, sx + w / 2 - 4, y + h / 2 - 3, 8, 6, "#707070");
  px(ctx, sx + w / 2 - 1, y + h / 2 - 6, 2, 2, "#60c0ff");
}

function drawRedBaron(
  ctx: CanvasRenderingContext2D,
  sx: number,
  y: number,
  w: number,
  h: number,
  time: number,
  warning: boolean,
) {
  const spin = time / 55;
  ctx.strokeStyle = "#600";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const rx = sx + w / 2 + Math.cos(a) * (w * 0.44);
    const ry = y + h / 2 + Math.sin(a) * (h * 0.38);
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, y + h / 2);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
  px(ctx, sx + w / 2 - 12, y + h / 2 - 10, 24, 18, "#c02020");
  px(ctx, sx + w / 2 - 10, y + h / 2 - 8, 20, 14, "#e03030");
  px(ctx, sx + w / 2 - 4, y + h / 2 - 12, 8, 6, "#1a1a1a");
  const blink = warning || Math.sin(time / 120) > 0.3;
  if (blink) {
    px(ctx, sx + w / 2 + 8, y + h / 2 - 10, 6, 6, "#ffe040");
    px(ctx, sx + w / 2 + 9, y + h / 2 - 9, 4, 4, "#ff8040");
  }
  if (warning) {
    ctx.fillStyle = "rgba(255,80,40,0.35)";
    ctx.beginPath();
    ctx.arc(sx + w / 2, y + h / 2, w * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCargoDrone(ctx: CanvasRenderingContext2D, sx: number, y: number, w: number, h: number, time: number) {
  const spin = time / 80;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const rx = sx + w / 2 + Math.cos(a) * (w * 0.4);
    const ry = y + h / 2 + Math.sin(a) * (h * 0.3);
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, y + h / 2);
    ctx.lineTo(rx, ry);
    ctx.stroke();
  }
  px(ctx, sx + w / 2 - 14, y + h / 2 - 8, 28, 16, "#506878");
  px(ctx, sx + w / 2 - 10, y + h / 2 - 4, 20, 10, "#688898");
  px(ctx, sx + w / 2 - 8, y + h / 2 + 8, 16, 10, "#8a6848");
  px(ctx, sx + w / 2 - 6, y + h / 2 + 10, 12, 6, "#a08058");
}

function drawDroneNest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  time: number,
  active: boolean,
) {
  const sx = x - camX;
  const gy = y;
  drawGroundShadow(ctx, sx, gy, 22);
  px(ctx, sx - 20, gy - NEST_H, 40, NEST_H - 4, "#4a4038");
  px(ctx, sx - 16, gy - NEST_H + 4, 32, NEST_H - 12, "#5a5048");
  px(ctx, sx - 8, gy - NEST_H + 8, 16, 12, "#3a3830");
  px(ctx, sx - 2, gy - NEST_H - 8, 4, 10, "#888");
  if (active && Math.sin(time / 200) > 0) {
    px(ctx, sx + 10, gy - NEST_H - 6, 4, 4, "#ff4040");
  }
  px(ctx, sx - 14, gy - 12, 8, 8, "#6a6058");
  px(ctx, sx + 6, gy - 12, 8, 8, "#6a6058");
}

function drawBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  fuseMs: number,
  grounded: boolean,
  cartoon = false,
) {
  const sx = x - camX;
  if (cartoon) {
    px(ctx, sx - 6, y - 10, 12, 12, "#3a4838");
    px(ctx, sx - 4, y - 8, 8, 8, "#f0d040");
    px(ctx, sx - 1, y - 12, 2, 4, "#ff8040");
  } else {
    px(ctx, sx - 5, y - 8, 10, 10, "#2a2a2a");
    px(ctx, sx - 3, y - 6, 6, 6, "#404040");
  }
  if (grounded && fuseMs < 400) {
    px(ctx, sx - 1, y - (cartoon ? 14 : 10), 2, 3, "#ff8040");
    ctx.fillStyle = `rgba(255,120,40,${0.4 + (400 - fuseMs) / 400})`;
    ctx.beginPath();
    ctx.arc(sx, y - 4, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (!cartoon) {
    px(ctx, sx - 1, y - 10, 2, 3, "#aaa");
  }
}

function drawQuadDrone(ctx: CanvasRenderingContext2D, sx: number, y: number, w: number, h: number, time: number) {
  const spin = time / 60;
  const arm = w * 0.42;
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const rx = sx + w / 2 + Math.cos(a) * arm;
    const ry = y + h / 2 + Math.sin(a) * arm * 0.5;
    ctx.beginPath();
    ctx.moveTo(sx + w / 2, y + h / 2);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.fillStyle = "rgba(80,80,80,0.5)";
    ctx.beginPath();
    ctx.ellipse(rx, ry, 10, 3, a, 0, Math.PI * 2);
    ctx.fill();
  }
  px(ctx, sx + w / 2 - 8, y + h / 2 - 6, 16, 12, "#484848");
  px(ctx, sx + w / 2 - 6, y + h / 2 - 4, 12, 8, "#606060");
  px(ctx, sx + w / 2 - 2, y + h / 2 - 8, 4, 4, "#f04040");
}

function drawFpvDrone(ctx: CanvasRenderingContext2D, sx: number, y: number, w: number, h: number) {
  px(ctx, sx + 4, y + 8, w - 8, h - 14, "#2a2848");
  px(ctx, sx + 6, y + 10, w - 12, h - 18, "#3a3868");
  px(ctx, sx, y + h / 2 - 2, w, 4, "#e03030");
  px(ctx, sx + w - 8, y + 6, 8, 10, "#f0e040");
  px(ctx, sx + w - 6, y + 8, 4, 6, "#fff8a0");
  px(ctx, sx + 2, y + 4, 6, 4, "#1a1a1a");
}

function drawFixedWing(ctx: CanvasRenderingContext2D, sx: number, y: number, w: number, h: number, time: number) {
  px(ctx, sx + 8, y + h / 2 - 2, w - 16, 4, "#5a6a7a");
  px(ctx, sx + w - 18, y + 4, 16, h - 8, "#4a5a6a");
  px(ctx, sx + w - 14, y + 8, 10, h - 16, "#6a7a8a");
  px(ctx, sx + 4, y + h / 2 + 2, 12, 3, "#3a4a5a");
  const blink = Math.sin(time / 200) > 0;
  if (blink) px(ctx, sx + 6, y + h / 2 - 1, 3, 3, "#f04040");
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
  time: number,
  bombWarning = false,
  opts?: { hp?: number; maxHp?: number; beepPhase?: number; turretAngle?: number },
) {
  const sx = x - camX;
  drawGroundShadow(ctx, sx + w / 2, y + h, kind === "red_baron" || kind === "armored_boom_bot" ? 26 : 18);
  if (kind === "boom_bot") {
    drawMonsterTruck(ctx, sx, y, w, h, time, "basic", opts?.hp, opts?.maxHp, opts?.beepPhase);
    return;
  }
  if (kind === "armored_boom_bot") {
    drawMonsterTruck(
      ctx,
      sx,
      y,
      w,
      h,
      time,
      "turret",
      opts?.hp,
      opts?.maxHp,
      opts?.beepPhase,
      opts?.turretAngle ?? 0,
    );
    return;
  }
  if (kind === "grenade_goblin_bot") {
    drawMonsterTruck(ctx, sx, y, w, h, time, "grenade", opts?.hp, opts?.maxHp, opts?.beepPhase);
    return;
  }
  if (kind === "quad") drawQuadDrone(ctx, sx, y, w, h, time);
  else if (kind === "recon") drawReconDrone(ctx, sx, y, w, h, time);
  else if (kind === "red_baron") drawRedBaron(ctx, sx, y, w, h, time, bombWarning);
  else if (kind === "cargo") drawCargoDrone(ctx, sx, y, w, h, time);
  else if (kind === "fpv") drawFpvDrone(ctx, sx, y, w, h);
  else drawFixedWing(ctx, sx, y, w, h, time);
}

function drawLandmineExplosion(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  camX: number,
  time: number,
  explodeUntil: number,
  timeMs: number,
) {
  const t = 1 - (explodeUntil - timeMs) / LANDMINE_EXPLODE_MS;
  const sx = x - camX;
  const sy = groundY - 16;
  const pulse = 0.55 + Math.sin(time / 28) * 0.25;

  // Dirt plume
  ctx.fillStyle = `rgba(72,48,32,${(1 - t) * 0.55})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 8, 18 + t * 52, 8 + t * 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer fireball
  ctx.fillStyle = `rgba(255,80,20,${pulse * (1 - t * 0.5)})`;
  ctx.beginPath();
  ctx.arc(sx, sy, 16 + t * 58, 0, Math.PI * 2);
  ctx.fill();

  // Mid blast
  ctx.fillStyle = `rgba(255,160,40,${0.85 * (1 - t * 0.65)})`;
  ctx.beginPath();
  ctx.arc(sx, sy, 10 + t * 38, 0, Math.PI * 2);
  ctx.fill();

  // Hot core + initial flash
  const flash = t < 0.12 ? 1 - t / 0.12 : 0;
  ctx.fillStyle = `rgba(255,255,220,${0.9 * (1 - t) + flash * 0.6})`;
  ctx.beginPath();
  ctx.arc(sx, sy, 6 + t * 20, 0, Math.PI * 2);
  ctx.fill();

  // Debris chunks
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + time / 90;
    const dist = 8 + t * (36 + i * 4);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist * 0.55 - t * 18;
    const size = 3 + (i % 3);
    px(ctx, sx + dx - size / 2, sy + dy - size / 2, size, size, i % 2 ? "#3a2818" : "#ff9040");
  }

  // Smoke puff
  ctx.fillStyle = `rgba(60,50,45,${(1 - t) * 0.45})`;
  ctx.beginPath();
  ctx.arc(sx, sy - 10 - t * 40, 12 + t * 28, 0, Math.PI * 2);
  ctx.fill();

  px(ctx, sx - 4, sy - 6, 8, 8, "#fff8c0");
}

function drawTongueAttack(
  ctx: CanvasRenderingContext2D,
  tongue: NonNullable<ReturnType<RainbowCowboyEngine["getTongueCurve"]>>,
  camX: number,
) {
  const x1 = tongue.x1 - camX;
  const cx = tongue.cx - camX;
  const tipX = tongue.tipX - camX;
  const stretch = tongue.progress;
  ctx.strokeStyle = "#c04070";
  ctx.lineWidth = 10 - stretch * 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, tongue.y1);
  ctx.quadraticCurveTo(cx, tongue.cy, tipX, tongue.tipY);
  ctx.stroke();
  ctx.strokeStyle = "#ff88a8";
  ctx.lineWidth = 6 - stretch;
  ctx.beginPath();
  ctx.moveTo(x1, tongue.y1);
  ctx.quadraticCurveTo(cx, tongue.cy, tipX, tongue.tipY);
  ctx.stroke();
  ctx.fillStyle = "#ff6090";
  ctx.beginPath();
  ctx.arc(tipX, tongue.tipY, 9 + stretch * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffb0c8";
  ctx.beginPath();
  ctx.arc(tipX - 2, tongue.tipY - 2, 4 + stretch, 0, Math.PI * 2);
  ctx.fill();
}

function drawGripperArm(
  ctx: CanvasRenderingContext2D,
  tongue: NonNullable<ReturnType<RainbowCowboyEngine["getTongueCurve"]>>,
  camX: number,
) {
  const x1 = tongue.x1 - camX;
  const cx = tongue.cx - camX;
  const tipX = tongue.tipX - camX;
  const stretch = tongue.progress;
  ctx.strokeStyle = "#3a3a38";
  ctx.lineWidth = 8 - stretch * 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, tongue.y1);
  ctx.quadraticCurveTo(cx, tongue.cy, tipX, tongue.tipY);
  ctx.stroke();
  ctx.strokeStyle = "#6a6a60";
  ctx.lineWidth = 5 - stretch;
  ctx.beginPath();
  ctx.moveTo(x1, tongue.y1);
  ctx.quadraticCurveTo(cx, tongue.cy, tipX, tongue.tipY);
  ctx.stroke();
  ctx.fillStyle = "#505048";
  ctx.beginPath();
  ctx.arc(tipX, tongue.tipY, 7 + stretch * 2, 0, Math.PI * 2);
  ctx.fill();
  const jaw = 5 + stretch * 2;
  ctx.fillStyle = "#787870";
  ctx.fillRect(tipX - jaw - 2, tongue.tipY - 3, jaw, 4);
  ctx.fillRect(tipX + 2, tongue.tipY - 3, jaw, 4);
  ctx.fillStyle = "#989890";
  ctx.fillRect(tipX - jaw, tongue.tipY + 1, jaw - 1, 3);
  ctx.fillRect(tipX + 3, tongue.tipY + 1, jaw - 1, 3);
}

function drawAttackVisual(ctx: CanvasRenderingContext2D, engine: RainbowCowboyEngine, camX: number) {
  const tongue = engine.getTongueCurve();
  if (tongue) {
    if (engine.rideType === "eod_robot") {
      drawGripperArm(ctx, tongue, camX);
    } else {
      drawTongueAttack(ctx, tongue, camX);
    }
  }

  if (engine.timeMs - engine.lastGunFireMs < 90 && engine.lastGunWeapon) {
    drawBlasterMuzzle(ctx, engine, camX, engine.lastGunWeapon);
  }
}

function drawEodRobot(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
  time: number,
) {
  const feetY = engine.playerY;
  const cx = engine.playerX - camX;
  const ducking = engine.isDucking && engine.grounded;
  const py = feetY - PLAYER_H + (ducking ? 10 : 0);
  const moving = Math.abs(engine.playerVx) > 0.5;
  const trackFrame = moving && engine.grounded ? Math.floor(time / 80) % 2 : 0;
  const bob = engine.grounded && !ducking ? Math.sin(time / 180) * 0.8 : 0;
  const flip = engine.facing === "left" ? -1 : 1;

  ctx.save();
  ctx.translate(cx, py + bob);
  ctx.scale(flip, 1);
  if (ducking) {
    ctx.scale(1, 0.82);
    ctx.translate(0, 8);
  }

  drawGroundShadow(ctx, 0, PLAYER_H - 2, ducking ? 44 : 38);

  if (engine.isRampage) {
    const hues = ["#f0f", "#ff0", "#0ff", "#f80", "#8f8", "#faf"];
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = hues[i];
      ctx.fillRect(-28 - i * 5, 28, 5, 5);
      ctx.globalAlpha = 1;
    }
  }

  // Tracks
  px(ctx, -28, ducking ? 44 : 48, 56, 8, "#2a2820");
  px(ctx, -26, ducking ? 45 : 49, 52, 6, "#3a3830");
  for (let i = -24; i <= 18; i += 8) {
    const notch = trackFrame === 0 ? 0 : 4;
    px(ctx, i + notch, ducking ? 46 : 50, 4, 3, "#1a1810");
  }

  // Lower, flatter robot chassis so the rider clearly sits on top.
  px(ctx, -28, ducking ? 30 : 34, 56, 16, "#4a5840");
  px(ctx, -26, ducking ? 32 : 36, 52, 12, "#5a6848");
  px(ctx, -22, ducking ? 34 : 38, 44, 8, "#6a7858");

  // Hazard stripe
  px(ctx, -20, ducking ? 36 : 40, 40, 4, "#c8a820");
  px(ctx, -18, ducking ? 37 : 41, 8, 2, "#1a1810");
  px(ctx, -5, ducking ? 37 : 41, 8, 2, "#1a1810");
  px(ctx, 8, ducking ? 37 : 41, 8, 2, "#1a1810");

  // Low-profile top deck / saddle
  px(ctx, -18, ducking ? 20 : 24, 36, 10, "#586850");
  px(ctx, -16, ducking ? 22 : 26, 32, 6, "#687860");
  px(ctx, -10, ducking ? 17 : 21, 20, 5, "#2a4818");

  // Front sensor and gripper mount, kept low to leave room for the rider.
  px(ctx, 10, ducking ? 22 : 26, 14, 10, "#485840");
  px(ctx, 12, ducking ? 24 : 28, 10, 6, "#586850");
  px(ctx, 14, ducking ? 25 : 29, 7, 4, "#1a2838");
  px(ctx, 15, ducking ? 26 : 30, 5, 2, "#48b8e8");
  px(ctx, 20, ducking ? 28 : 32, 8, 6, "#484840");
  px(ctx, 22, ducking ? 30 : 34, 5, 4, "#686860");

  // Antenna
  px(ctx, -16, ducking ? 7 : 11, 3, 14, "#505048");
  px(ctx, -17, ducking ? 5 : 9, 5, 3, "#c04040");

  // --- Green bomb-suit rider on the robot ---
  const riderY = ducking ? 10 : 6;
  px(ctx, -13, 21 + riderY, 26, 5, "#2a2818");
  px(ctx, -9, 18 + riderY, 18, 5, "#3a5828");
  // Backpack
  px(ctx, -13, -6 + riderY, 10, 14, "#2d5020");
  px(ctx, -11, -4 + riderY, 6, 10, "#3a6828");
  px(ctx, -10, -2 + riderY, 4, 3, "#4a7838");
  // Torso (puffy suit)
  px(ctx, -8, -10 + riderY, 24, 24, "#3a6828");
  px(ctx, -6, -8 + riderY, 20, 20, "#4a8838");
  px(ctx, -4, -6 + riderY, 16, 16, "#5a9850");
  px(ctx, -2, -4 + riderY, 12, 10, "#6aaa58");
  // Belt
  px(ctx, -8, 6 + riderY, 24, 5, "#2a4818");
  px(ctx, -6, 7 + riderY, 20, 3, "#3a5828");
  // Helmet dome
  px(ctx, -4, -22 + riderY, 18, 14, "#4a8838");
  px(ctx, -2, -26 + riderY, 14, 10, "#5a9850");
  px(ctx, 0, -28 + riderY, 10, 8, "#6aaa58");
  px(ctx, 0, -24 + riderY, 10, 3, "#88c8ff");
  // Visor
  px(ctx, 0, -20 + riderY, 10, 6, "#1a2838");
  px(ctx, 1, -19 + riderY, 8, 4, "#48b8e8");
  px(ctx, 2, -18 + riderY, 4, 2, "#a8f0ff");
  // Legs planted on the top deck
  px(ctx, -8, 10 + riderY, 8, 12, "#2d5020");
  px(ctx, 8, 10 + riderY, 8, 12, "#2d5020");
  px(ctx, -9, 20 + riderY, 10, 4, "#1a1828");
  px(ctx, 8, 20 + riderY, 10, 4, "#1a1828");
  // Arms, gloves, and handlebar
  px(ctx, -14, -4 + riderY, 8, 14, "#3a6828");
  px(ctx, -13, -2 + riderY, 6, 10, "#4a8838");
  px(ctx, -14, 8 + riderY, 8, 6, "#f0e0c8");
  px(ctx, 12, -4 + riderY, 8, 14, "#3a6828");
  px(ctx, 13, -2 + riderY, 6, 10, "#4a8838");
  px(ctx, 12, 8 + riderY, 8, 6, "#f0e0c8");
  ctx.strokeStyle = "#8a5840";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 10 + riderY);
  ctx.lineTo(20, ducking ? 22 : 26);
  ctx.stroke();

  if (engine.timeMs < engine.hitFlashUntil) {
    ctx.globalAlpha = 0.45 + Math.sin(time / 35) * 0.25;
    px(ctx, -32, -26, 64, 80, "#fff");
    ctx.globalAlpha = 1;
  }

  if (engine.isGassed) {
    ctx.fillStyle = "rgba(60,200,60,0.22)";
    ctx.beginPath();
    ctx.arc(0, 22, 38, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawUnicornRider(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
  time: number,
) {
  const feetY = engine.playerY;
  const cx = engine.playerX - camX;
  const ducking = engine.isDucking && engine.grounded;
  const py = feetY - PLAYER_H + (ducking ? 14 : 0);
  const moving = Math.abs(engine.playerVx) > 0.5;
  const runFrame = moving && engine.grounded && !ducking ? Math.floor(time / 90) % 2 : 0;
  const bob = engine.grounded && !ducking ? Math.sin(time / 160) * 1.5 : 0;
  const flip = engine.facing === "left" ? -1 : 1;

  ctx.save();
  ctx.translate(cx, py + bob);
  ctx.scale(flip, 1);
  if (ducking) {
    ctx.scale(1, 0.78);
    ctx.translate(0, 10);
  }

  drawGroundShadow(ctx, 0, PLAYER_H - 2, ducking ? 42 : 34);

  if (engine.isRampage) {
    const hues = ["#f0f", "#ff0", "#0ff", "#f80", "#8f8", "#faf"];
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = hues[i];
      ctx.fillRect(-30 - i * 5, 30, 6, 6);
      ctx.globalAlpha = 1;
    }
  }

  // --- Unicorn tail (curled) ---
  px(ctx, -34, 22, 12, 8, "#d85898");
  px(ctx, -40, 18, 10, 8, "#e870a8");
  px(ctx, -44, 12, 8, 10, "#f088b8");
  px(ctx, -46, 8, 6, 8, "#f8a0c8");
  px(ctx, -44, 6, 4, 4, "#ffc0e0");

  // --- Back legs ---
  const backL = ducking ? 46 : runFrame === 0 ? 40 : 42;
  const backR = ducking ? 46 : runFrame === 0 ? 42 : 40;
  px(ctx, -10, backL, 10, 16, "#c85890");
  px(ctx, -8, backL + 2, 6, 12, "#e078a8");
  px(ctx, -10, backL + 14, 10, 5, "#f0e8d8");
  px(ctx, -8, backL + 17, 6, 3, "#1a1828");
  px(ctx, 6, backR, 10, 16, "#c85890");
  px(ctx, 8, backR + 2, 6, 12, "#e078a8");
  px(ctx, 6, backR + 14, 10, 5, "#f0e8d8");
  px(ctx, 8, backR + 17, 6, 3, "#1a1828");

  // --- Body (round belly) ---
  px(ctx, -26, 22, 48, 24, "#e868a8");
  px(ctx, -22, 18, 40, 10, "#f890c0");
  px(ctx, -18, 24, 32, 16, "#f078b0");
  px(ctx, -12, 28, 18, 10, "#f8a8c8");
  px(ctx, -8, 30, 10, 6, "#ffd0e8");

  // --- Front legs ---
  const frontL = ducking ? 46 : runFrame === 0 ? 42 : 40;
  const frontR = ducking ? 46 : runFrame === 0 ? 40 : 42;
  px(ctx, 12, frontL, 10, 16, "#c85890");
  px(ctx, 14, frontL + 2, 6, 12, "#e078a8");
  px(ctx, 12, frontL + 14, 10, 5, "#f0e8d8");
  px(ctx, 14, frontL + 17, 6, 3, "#1a1828");
  px(ctx, -2, frontR, 10, 16, "#c85890");
  px(ctx, 0, frontR + 2, 6, 12, "#e078a8");
  px(ctx, -2, frontR + 14, 10, 5, "#f0e8d8");
  px(ctx, 0, frontR + 17, 6, 3, "#1a1828");

  // --- Neck + head ---
  if (ducking) {
    px(ctx, 10, 18, 18, 14, "#e878a8");
    px(ctx, 12, 20, 14, 10, "#f090b8");
    px(ctx, 14, 12, 22, 14, "#f8a0c8");
    px(ctx, 16, 14, 18, 10, "#ffc0e0");
    px(ctx, 28, 18, 10, 8, "#f8b8d0");
    px(ctx, 30, 20, 6, 5, "#ffe0f0");
    px(ctx, 34, 19, 2, 2, "#d07090");
    px(ctx, 20, 15, 2, 2, "#1a1828");
    px(ctx, 26, 15, 2, 2, "#1a1828");
    px(ctx, 36, 8, 4, 8, "#ffd860");
    px(ctx, 37, 6, 3, 4, "#fff0a0");
  } else {
    px(ctx, 16, 10, 14, 20, "#e878a8");
    px(ctx, 18, 8, 10, 16, "#f090b8");
    px(ctx, 10, 2, 10, 14, "#ff58a8");
    px(ctx, 6, 6, 8, 12, "#ff70b8");
    px(ctx, 2, 10, 6, 10, "#ff88c8");
    px(ctx, 14, 0, 6, 10, "#ff4098");
    px(ctx, 8, -2, 8, 6, "#ff68b0");
    px(ctx, 22, -4, 20, 16, "#f8a0c8");
    px(ctx, 24, -6, 16, 12, "#ffc0e0");
    px(ctx, 26, -2, 12, 10, "#f090b8");
    px(ctx, 24, -12, 6, 8, "#f8a8d0");
    px(ctx, 25, -11, 4, 5, "#ffd0e8");
    px(ctx, 36, 2, 10, 8, "#f8b8d0");
    px(ctx, 38, 4, 6, 5, "#ffe0f0");
    px(ctx, 30, 0, 8, 8, "#fff");
    px(ctx, 32, 2, 5, 5, "#1a1030");
    px(ctx, 33, 3, 2, 2, "#fff");
    px(ctx, 40, 6, 2, 2, "#d07090");
    px(ctx, 38, -16, 6, 14, "#ffd860");
    px(ctx, 40, -20, 4, 8, "#fff0a0");
    px(ctx, 39, -14, 4, 3, "#e8b840");
    px(ctx, 41, -10, 2, 3, "#e8b840");
  }

  // --- Green bomb-suit rider ---
  const riderY = ducking ? 4 : 0;
  // Backpack
  px(ctx, -12, -6 + riderY, 10, 14, "#2d5020");
  px(ctx, -10, -4 + riderY, 6, 10, "#3a6828");
  px(ctx, -9, -2 + riderY, 4, 3, "#4a7838");
  // Torso (puffy suit)
  px(ctx, -8, -10 + riderY, 24, 24, "#3a6828");
  px(ctx, -6, -8 + riderY, 20, 20, "#4a8838");
  px(ctx, -4, -6 + riderY, 16, 16, "#5a9850");
  px(ctx, -2, -4 + riderY, 12, 10, "#6aaa58");
  // Belt
  px(ctx, -8, 6 + riderY, 24, 5, "#2a4818");
  px(ctx, -6, 7 + riderY, 20, 3, "#3a5828");
  // Helmet dome
  px(ctx, -4, -22 + riderY, 18, 14, "#4a8838");
  px(ctx, -2, -26 + riderY, 14, 10, "#5a9850");
  px(ctx, 0, -28 + riderY, 10, 8, "#6aaa58");
  px(ctx, 0, -24 + riderY, 10, 3, "#88c8ff");
  // Visor
  px(ctx, 0, -20 + riderY, 10, 6, "#1a2838");
  px(ctx, 1, -19 + riderY, 8, 4, "#48b8e8");
  px(ctx, 2, -18 + riderY, 4, 2, "#a8f0ff");
  // Arms + gloves
  px(ctx, -14, -4 + riderY, 8, 14, "#3a6828");
  px(ctx, -13, -2 + riderY, 6, 10, "#4a8838");
  px(ctx, -14, 8 + riderY, 8, 6, "#f0e0c8");
  px(ctx, 12, -4 + riderY, 8, 14, "#3a6828");
  px(ctx, 13, -2 + riderY, 6, 10, "#4a8838");
  px(ctx, 12, 8 + riderY, 8, 6, "#f0e0c8");
  // Reins
  ctx.strokeStyle = "#8a5840";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, 4 + riderY);
  ctx.lineTo(ducking ? 16 : 20, ducking ? 14 : 8);
  ctx.stroke();

  if (engine.timeMs < engine.hitFlashUntil) {
    ctx.globalAlpha = 0.45 + Math.sin(time / 35) * 0.25;
    px(ctx, -36, -30, 72, 76, "#fff");
    ctx.globalAlpha = 1;
  }

  if (engine.isGassed) {
    ctx.fillStyle = "rgba(60,200,60,0.22)";
    ctx.beginPath();
    ctx.arc(0, 18, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
  time: number,
) {
  if (engine.rideType === "eod_robot") {
    drawEodRobot(ctx, engine, camX, time);
  } else {
    drawUnicornRider(ctx, engine, camX, time);
  }
  drawAttackVisual(ctx, engine, camX);
}

function drawRainbowBlast(ctx: CanvasRenderingContext2D, engine: RainbowCowboyEngine) {
  if (engine.timeMs >= engine.rainbowBlastUntil) return;
  const t = Math.max(0, Math.min(1, 1 - (engine.rainbowBlastUntil - engine.timeMs) / 900));
  const cx = engine.playerX - engine.cameraX;
  const cy = engine.playerY - 24;
  const colors = ["#e83838", "#e88820", "#e8e020", "#38b838", "#3868e8", "#a040c0"];
  for (let i = 0; i < colors.length; i++) {
    const radius = 50 + t * 340 - i * 16;
    if (radius <= 0) continue;
    ctx.strokeStyle = colors[i];
    ctx.globalAlpha = 0.55 * (1 - t * 0.85);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawAtmosphere(ctx: CanvasRenderingContext2D) {
  const warm = ctx.createLinearGradient(0, VIEW_H * 0.5, 0, VIEW_H);
  warm.addColorStop(0, "rgba(255,220,160,0)");
  warm.addColorStop(1, "rgba(255,200,120,0.08)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const vig = ctx.createRadialGradient(cx, cy, VIEW_H * 0.35, cx, cy, VIEW_H * 0.85);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawGassedOverlay(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = `rgba(50,160,50,${0.1 + Math.sin(time / 280) * 0.04})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  time: number,
  particles?: RainbowCowboyParticlePool,
) {
  const camX = engine.cameraX;
  const config = engine.config;
  const theme = config.theme ?? "pasture";

  ctx.save();
  if (engine.isGassed) {
    const wobble = Math.sin(time / 110) * 1.5;
    ctx.translate(wobble, Math.sin(time / 85) * 1);
  }

  if (theme === "canyon") {
    drawCanyonSky(ctx, camX, time);
    drawCanyonGroundLayer(ctx, config, camX);
  } else if (theme === "alamo") {
    drawAlamoSky(ctx, camX, time);
    drawAlamoGroundLayer(ctx, config, camX);
  } else {
    drawParallaxSky(ctx, camX, time);
    drawGroundLayer(ctx, config, camX);
  }

  for (const plat of config.platforms) {
    if (plat.x + plat.w < camX - 20 || plat.x > camX + VIEW_W + 20) continue;
    if (theme === "canyon") drawCanyonPlatform(ctx, plat.x, plat.y, plat.w, plat.h, camX);
    else if (theme === "alamo") drawAlamoPlatform(ctx, plat.x, plat.y, plat.w, plat.h, camX);
    else drawPlatform(ctx, plat.x, plat.y, plat.w, plat.h, camX);
  }

  for (const wall of config.walls) {
    if (wall.x + wall.w < camX - 20 || wall.x > camX + VIEW_W + 20) continue;
    if (theme === "canyon") drawCanyonWall(ctx, wall.x, wall.y, wall.w, wall.h, camX);
    else if (theme === "alamo") drawAlamoWall(ctx, wall.x, wall.y, wall.w, wall.h, camX);
    else drawWall(ctx, wall.x, wall.y, wall.w, wall.h, camX);
  }

  if (theme === "canyon") {
    drawCanyonExtraction(ctx, config.extractionX, config.level.groundY, camX, time);
  } else if (theme === "alamo") {
    drawAlamoExtraction(ctx, config.extractionX, config.level.groundY, camX, time);
  } else {
    drawExtractionZone(ctx, config.extractionX, config.level.groundY, camX, time);
  }

  for (const nest of engine.nests) {
    if (!nest.active) continue;
    if (nest.x < camX - 60 || nest.x > camX + VIEW_W + 60) continue;
    drawDroneNest(ctx, nest.x, nest.y, camX, time, nest.active);
  }

  for (const pickup of engine.pickups) {
    if (!pickup.active) continue;
    if (pickup.x < camX - 40 || pickup.x > camX + VIEW_W + 40) continue;
    drawPickup(ctx, pickup.kind, pickup.x, pickup.y, camX, time);
  }

  for (const hazard of engine.hazards) {
    const fx = hazard as { explodeUntil?: number; kind: string; x: number; y: number };
    if (fx.explodeUntil && engine.timeMs < fx.explodeUntil && fx.kind === "landmine") {
      drawLandmineExplosion(
        ctx,
        fx.x,
        config.level.groundY,
        camX,
        time,
        fx.explodeUntil,
        engine.timeMs,
      );
    }
    if (!hazard.active) continue;
    if (hazard.x < camX - 80 || hazard.x > camX + VIEW_W + 80) continue;
    drawHazard(
      ctx,
      hazard.kind,
      hazard.x,
      hazard.y,
      camX,
      time,
      hazard.timerMs,
      hazard.timerMaxMs,
      hazard.exploded,
    );
  }

  for (const bomb of engine.bombs) {
    if (!bomb.active) continue;
    if (bomb.x < camX - 40 || bomb.x > camX + VIEW_W + 40) continue;
    drawBomb(ctx, bomb.x, bomb.y, camX, bomb.fuseMs, bomb.grounded, bomb.cartoon);
  }

  for (const shot of engine.blasterProjectiles) {
    if (!shot.active) continue;
    if (shot.x < camX - 40 || shot.x > camX + VIEW_W + 40) continue;
    drawBlasterProjectile(ctx, shot.x, shot.y, camX, shot.weapon, shot.vx >= 0 ? 1 : -1);
  }

  for (const bullet of engine.enemyBullets) {
    if (!bullet.active) continue;
    if (bullet.x < camX - 40 || bullet.x > camX + VIEW_W + 40) continue;
    drawEnemyBullet(ctx, bullet.x, bullet.y, camX);
  }

  for (const enemy of engine.enemies) {
    if (!enemy.active) continue;
    if (enemy.x < camX - 60 || enemy.x > camX + VIEW_W + 60) continue;
    drawEnemy(
      ctx,
      enemy.kind,
      enemy.x,
      enemy.y,
      enemy.w,
      enemy.h,
      camX,
      time,
      enemy.bombWarning,
      {
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        beepPhase: enemy.beepPhase,
        turretAngle: enemy.turretAngle,
      },
    );
  }

  drawPlayer(ctx, engine, camX, time);
  drawRainbowBlast(ctx, engine);
  particles?.draw(ctx);

  if (engine.isGassed) drawGassedOverlay(ctx, time);

  if (engine.extractionReached) {
    const a = Math.min(1, engine.levelCompleteHold / 600);
    ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`;
    ctx.fillRect(0, VIEW_H * 0.22, VIEW_W, 110);
    ctx.fillStyle = "#ff60c0";
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      engine.config.completeBanner ?? "EXTRACTION REACHED",
      VIEW_W / 2,
      VIEW_H * 0.3,
    );
    ctx.fillStyle = "#fff";
    ctx.font = "14px monospace";
    ctx.fillText(getRideExtractionLine(engine.rideType), VIEW_W / 2, VIEW_H * 0.38);
    ctx.textAlign = "left";
  }

  ctx.restore();
  drawAtmosphere(ctx);
}

export function maybeSpawnDust(
  particles: RainbowCowboyParticlePool,
  engine: RainbowCowboyEngine,
  prevX: number,
  prevY: number,
) {
  if (!engine.grounded) return;
  const moved = Math.hypot(engine.playerX - prevX, engine.playerY - prevY);
  if (moved > 0.8) {
    particles.spawnDust(engine.playerX, engine.playerY, engine.cameraX);
  }
}
