import {
  BALLOON_SIZE,
  DYNAMITE_RADIUS,
  DYNAMITE_SIZE,
  GROUND_TILE,
  LANDMINE_EXPLODE_MS,
  PICKUP_SIZE,
  PLAYER_H,
  PLAYER_W,
  VIEW_H,
  VIEW_W,
} from "./rainbowCowboyConstants";
import type { RainbowCowboyEngine } from "./rainbowCowboyEngine";
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
    case "white_monster":
      px(ctx, sx - 8, py, 16, 20, "#e0e0e0");
      px(ctx, sx - 6, py + 2, 12, 16, "#fff");
      px(ctx, sx - 5, py + 8, 10, 5, "#00c8f0");
      px(ctx, sx - 3, py + 9, 6, 3, "#0088c0");
      px(ctx, sx - 6, py - 2, 4, 3, "#ccc");
      break;
    case "zyn_tin":
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
    ctx.ellipse(sx, gy - 2, 28, 10, 0, 0, Math.PI * 2);
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
) {
  const sx = x - camX;
  drawGroundShadow(ctx, sx + w / 2, y + h, 16);
  if (kind === "quad") drawQuadDrone(ctx, sx, y, w, h, time);
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

function drawUnicornRider(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
  time: number,
) {
  const feetY = engine.playerY;
  const cx = engine.playerX - camX;
  const py = feetY - PLAYER_H;
  const moving = Math.abs(engine.playerVx) > 0.5;
  const runFrame = moving && engine.grounded ? Math.floor(time / 90) % 2 : 0;
  const bob = engine.grounded ? Math.sin(time / 160) * 1.5 : 0;
  const flip = engine.facing === "left" ? -1 : 1;

  ctx.save();
  ctx.translate(cx, py + bob);
  ctx.scale(flip, 1);

  drawGroundShadow(ctx, 0, PLAYER_H - 2, 34);

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
  const backL = runFrame === 0 ? 40 : 42;
  const backR = runFrame === 0 ? 42 : 40;
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
  const frontL = runFrame === 0 ? 42 : 40;
  const frontR = runFrame === 0 ? 40 : 42;
  px(ctx, 12, frontL, 10, 16, "#c85890");
  px(ctx, 14, frontL + 2, 6, 12, "#e078a8");
  px(ctx, 12, frontL + 14, 10, 5, "#f0e8d8");
  px(ctx, 14, frontL + 17, 6, 3, "#1a1828");
  px(ctx, -2, frontR, 10, 16, "#c85890");
  px(ctx, 0, frontR + 2, 6, 12, "#e078a8");
  px(ctx, -2, frontR + 14, 10, 5, "#f0e8d8");
  px(ctx, 0, frontR + 17, 6, 3, "#1a1828");

  // --- Neck ---
  px(ctx, 16, 10, 14, 20, "#e878a8");
  px(ctx, 18, 8, 10, 16, "#f090b8");

  // --- Mane (fluffy layers) ---
  px(ctx, 10, 2, 10, 14, "#ff58a8");
  px(ctx, 6, 6, 8, 12, "#ff70b8");
  px(ctx, 2, 10, 6, 10, "#ff88c8");
  px(ctx, 14, 0, 6, 10, "#ff4098");
  px(ctx, 8, -2, 8, 6, "#ff68b0");

  // --- Head ---
  px(ctx, 22, -4, 20, 16, "#f8a0c8");
  px(ctx, 24, -6, 16, 12, "#ffc0e0");
  px(ctx, 26, -2, 12, 10, "#f090b8");
  // Ear
  px(ctx, 24, -12, 6, 8, "#f8a8d0");
  px(ctx, 25, -11, 4, 5, "#ffd0e8");
  // Snout
  px(ctx, 36, 2, 10, 8, "#f8b8d0");
  px(ctx, 38, 4, 6, 5, "#ffe0f0");
  // Eye
  px(ctx, 30, 0, 8, 8, "#fff");
  px(ctx, 32, 2, 5, 5, "#1a1030");
  px(ctx, 33, 3, 2, 2, "#fff");
  // Nostril
  px(ctx, 40, 6, 2, 2, "#d07090");

  // --- Horn (striped) ---
  px(ctx, 38, -16, 6, 14, "#ffd860");
  px(ctx, 40, -20, 4, 8, "#fff0a0");
  px(ctx, 39, -14, 4, 3, "#e8b840");
  px(ctx, 41, -10, 2, 3, "#e8b840");

  // --- Green bomb-suit rider ---
  // Backpack
  px(ctx, -12, -6, 10, 14, "#2d5020");
  px(ctx, -10, -4, 6, 10, "#3a6828");
  px(ctx, -9, -2, 4, 3, "#4a7838");
  // Torso (puffy suit)
  px(ctx, -8, -10, 24, 24, "#3a6828");
  px(ctx, -6, -8, 20, 20, "#4a8838");
  px(ctx, -4, -6, 16, 16, "#5a9850");
  px(ctx, -2, -4, 12, 10, "#6aaa58");
  // Belt
  px(ctx, -8, 6, 24, 5, "#2a4818");
  px(ctx, -6, 7, 20, 3, "#3a5828");
  // Helmet dome
  px(ctx, -4, -22, 18, 14, "#4a8838");
  px(ctx, -2, -26, 14, 10, "#5a9850");
  px(ctx, 0, -28, 10, 8, "#6aaa58");
  px(ctx, 0, -24, 10, 3, "#88c8ff");
  // Visor
  px(ctx, 0, -20, 10, 6, "#1a2838");
  px(ctx, 1, -19, 8, 4, "#48b8e8");
  px(ctx, 2, -18, 4, 2, "#a8f0ff");
  // Arms + gloves
  px(ctx, -14, -4, 8, 14, "#3a6828");
  px(ctx, -13, -2, 6, 10, "#4a8838");
  px(ctx, -14, 8, 8, 6, "#f0e0c8");
  px(ctx, 12, -4, 8, 14, "#3a6828");
  px(ctx, 13, -2, 6, 10, "#4a8838");
  px(ctx, 12, 8, 8, 6, "#f0e0c8");
  // Reins
  ctx.strokeStyle = "#8a5840";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, 4);
  ctx.lineTo(20, 8);
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

  const tongue = engine.getTongueSegment();
  if (tongue) {
    const t1x = tongue.x1 - camX;
    const t2x = tongue.x2 - camX;
    ctx.strokeStyle = "#c04070";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(t1x, tongue.y1);
    ctx.lineTo(t2x, tongue.y2);
    ctx.stroke();
    ctx.strokeStyle = "#ff88a8";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(t1x, tongue.y1);
    ctx.lineTo(t2x, tongue.y2);
    ctx.stroke();
    ctx.fillStyle = "#ff6090";
    ctx.beginPath();
    ctx.arc(t2x, tongue.y2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb0c8";
    ctx.beginPath();
    ctx.arc(t2x - 2, tongue.y2 - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRainbowBlast(ctx: CanvasRenderingContext2D, engine: RainbowCowboyEngine) {
  if (engine.timeMs >= engine.rainbowBlastUntil) return;
  const t = 1 - (engine.rainbowBlastUntil - engine.timeMs) / 900;
  const cx = engine.playerX - engine.cameraX;
  const cy = engine.playerY - 24;
  const colors = ["#e83838", "#e88820", "#e8e020", "#38b838", "#3868e8", "#a040c0"];
  for (let i = 0; i < colors.length; i++) {
    ctx.strokeStyle = colors[i];
    ctx.globalAlpha = 0.55 * (1 - t * 0.85);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 50 + t * 340 - i * 16, 0, Math.PI * 2);
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

  ctx.save();
  if (engine.isGassed) {
    const wobble = Math.sin(time / 110) * 1.5;
    ctx.translate(wobble, Math.sin(time / 85) * 1);
  }

  drawParallaxSky(ctx, camX, time);
  drawGroundLayer(ctx, config, camX);

  for (const plat of config.platforms) {
    if (plat.x + plat.w < camX - 20 || plat.x > camX + VIEW_W + 20) continue;
    drawPlatform(ctx, plat.x, plat.y, plat.w, plat.h, camX);
  }

  for (const wall of config.walls) {
    if (wall.x + wall.w < camX - 20 || wall.x > camX + VIEW_W + 20) continue;
    drawWall(ctx, wall.x, wall.y, wall.w, wall.h, camX);
  }

  drawExtractionZone(ctx, config.extractionX, config.level.groundY, camX, time);

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

  for (const enemy of engine.enemies) {
    if (!enemy.active) continue;
    if (enemy.x < camX - 60 || enemy.x > camX + VIEW_W + 60) continue;
    drawEnemy(ctx, enemy.kind, enemy.x, enemy.y, enemy.w, enemy.h, camX, time);
  }

  drawUnicornRider(ctx, engine, camX, time);
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
    ctx.fillText("EXTRACTION REACHED", VIEW_W / 2, VIEW_H * 0.3);
    ctx.fillStyle = "#fff";
    ctx.font = "14px monospace";
    ctx.fillText("The unicorn made it. Poor life choices rewarded.", VIEW_W / 2, VIEW_H * 0.38);
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
