import {
  FLOATING_LOG_H,
  FLOATING_LOG_W,
  VIEW_H,
  VIEW_W,
  WATER_SURFACE_Y,
} from "./rainbowCowboyConstants";
import {
  drawGatorBakedFrame,
  ensureGatorFrameCache,
  GATOR_FRAMES,
  GATOR_ORIGIN_X,
  GATOR_ORIGIN_Y,
} from "./rainbowCowboyLakeSprites";
import type { LevelConfig } from "./rainbowCowboyTypes";

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function drawLakeSky(ctx: CanvasRenderingContext2D, camX: number, time: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#8ec8e8");
  grad.addColorStop(0.22, "#6ab0d8");
  grad.addColorStop(0.45, "#4898c8");
  grad.addColorStop(0.72, "#3a88b8");
  grad.addColorStop(1, "#2a7898");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Distant treeline
  const parallax = camX * 0.08;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 12; i++) {
    const tx = ((i * 140 - parallax + 60) % (VIEW_W + 180)) - 90;
    const th = 28 + (i % 4) * 8;
    px(ctx, tx, WATER_SURFACE_Y - th - 18, 18, th, "#1a5038");
    px(ctx, tx + 4, WATER_SURFACE_Y - th - 24, 12, 10, "#226848");
    px(ctx, tx - 6, WATER_SURFACE_Y - th - 12, 10, 8, "#185030");
  }
  ctx.globalAlpha = 1;

  // Sun shimmer on surface
  ctx.globalAlpha = 0.18 + Math.sin(time / 700) * 0.06;
  for (let i = 0; i < 5; i++) {
    const ox = ((camX * 0.06 + i * 160 + time * 0.02) % (VIEW_W + 120)) - 60;
    px(ctx, ox, WATER_SURFACE_Y + 4 + i * 2, 48, 6, "#fff8d0");
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(220,248,255,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= VIEW_W; x += 8) {
    const wx = x + camX * 0.04;
    const y = WATER_SURFACE_Y + Math.sin(wx / 36 + time / 420) * 4;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawLakeBackground(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
  groundY: number,
) {
  const parallax = camX * 0.14;

  // Distant dock posts
  for (let i = 0; i < 8; i++) {
    const dx = i * 520 + 180 - parallax * 0.4;
    const sx = dx - camX * 0.55;
    if (sx < -40 || sx > VIEW_W + 40) continue;
    px(ctx, sx, WATER_SURFACE_Y + 20, 8, groundY - WATER_SURFACE_Y - 20, "#3a2818");
    px(ctx, sx + 1, WATER_SURFACE_Y + 20, 6, groundY - WATER_SURFACE_Y - 22, "#4a3828");
    px(ctx, sx - 10, WATER_SURFACE_Y + 18, 28, 6, "#5a4838");
  }

  // Lily pads (background)
  for (let i = 0; i < 10; i++) {
    const lx = i * 280 + 90 - parallax * 0.55;
    const sx = lx - camX * 0.62;
    if (sx < -30 || sx > VIEW_W + 30) continue;
    const ly = groundY - 90 - (i % 4) * 22 + Math.sin(time / 500 + i) * 2;
    px(ctx, sx, ly, 16, 8, "#2a6848");
    px(ctx, sx + 3, ly + 1, 10, 5, "#348858");
    px(ctx, sx + 6, ly - 1, 4, 4, "#ffe878");
  }

  // Caustic ripples (shallow lake light)
  ctx.globalAlpha = 0.08 + Math.sin(time / 600) * 0.03;
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 200 - parallax * 0.3 + time * 0.012) % (VIEW_W + 100)) - 50;
    const cy = WATER_SURFACE_Y + 80 + (i % 3) * 40;
    px(ctx, cx, cy, 24, 8, "#b8f0ff");
    px(ctx, cx + 8, cy + 6, 18, 6, "#98e0f0");
  }
  ctx.globalAlpha = 1;
}

export function drawLakeFloor(ctx: CanvasRenderingContext2D, config: LevelConfig, camX: number) {
  const groundY = config.level.groundY;
  const startTile = Math.floor(camX / 16) * 16;
  for (let x = startTile; x < camX + VIEW_W + 32; x += 16) {
    const sx = x - camX;
    px(ctx, sx, groundY, 16, VIEW_H - groundY, "#3a4830");
    px(ctx, sx, groundY, 16, 6, "#4a5840");
    px(ctx, sx + 2, groundY + 6, 12, 4, "#424838");
    if ((x / 16) % 4 === 0) {
      px(ctx, sx + 3, groundY + 10, 10, 5, "#384030");
    }
    if ((x / 16) % 5 === 2) {
      px(ctx, sx + 5, groundY + 16, 6, 4, "#2a3028");
    }
  }
}

export function drawLakeForeground(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
  groundY: number,
) {
  const parallax = camX * 0.28;

  // Reeds along shore floor
  for (let i = 0; i < 12; i++) {
    const wx = i * 68 + 20 - parallax;
    const sx = wx - camX * 0.78;
    if (sx < -24 || sx > VIEW_W + 24) continue;
    const sway = Math.sin(time / 260 + i * 0.8) * 3;
    const h = 18 + (i % 3) * 6;
    px(ctx, sx + sway, groundY - h, 3, h, "#3a6848");
    px(ctx, sx + 1 + sway * 0.5, groundY - h + 3, 2, h - 4, "#468858");
  }

  // Near lily pads
  const pads = [
    { x: 350, yOff: 70 },
    { x: 1200, yOff: 85 },
    { x: 2600, yOff: 65 },
    { x: 4100, yOff: 90 },
    { x: 5800, yOff: 75 },
    { x: 7400, yOff: 80 },
    { x: 8900, yOff: 70 },
  ];
  for (const pad of pads) {
    const sx = pad.x - parallax * 0.85 - camX * 0.72;
    if (sx < -24 || sx > VIEW_W + 24) continue;
    const ly = groundY - pad.yOff + Math.sin(time / 380 + pad.x * 0.01) * 2;
    px(ctx, sx, ly, 18, 10, "#286040");
    px(ctx, sx + 4, ly + 2, 12, 6, "#348850");
    px(ctx, sx + 7, ly, 5, 5, "#ffe060");
  }
}

export function drawLakePlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#5a4838");
  px(ctx, sx + 2, y + 1, w - 4, h - 2, "#6a5848");
  for (let pxX = sx + 4; pxX < sx + w - 4; pxX += 12) {
    px(ctx, pxX, y + 2, 8, h - 4, "#4a3828");
  }
  px(ctx, sx, y + h - 2, w, 2, "#3a2818");
}

export function drawLakeWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#3a3028");
  px(ctx, sx + 2, y + 2, w - 4, h - 4, "#4a4038");
  if (w <= 18) {
    px(ctx, sx + 3, y, w - 6, 4, "#5a5048");
    px(ctx, sx + 1, y + h - 6, w - 2, 4, "#2a2018");
  }
}

export function drawLakeExtraction(
  ctx: CanvasRenderingContext2D,
  extractionX: number,
  groundY: number,
  camX: number,
  time: number,
) {
  const sx = extractionX - camX;
  const bob = Math.sin(time / 400) * 2;

  // Lakeside dock
  px(ctx, sx - 40, groundY - 8, 80, 8, "#5a4838");
  px(ctx, sx - 36, groundY - 10, 72, 4, "#6a5848");
  for (let i = 0; i < 4; i++) {
    px(ctx, sx - 32 + i * 22, groundY, 6, 24, "#3a2818");
  }

  // Extraction beacon
  px(ctx, sx - 6, groundY - 48 + bob, 12, 40, "#286868");
  px(ctx, sx - 4, groundY - 52 + bob, 8, 6, "#38a8a8");
  const pulse = 0.5 + Math.sin(time / 120) * 0.35;
  ctx.globalAlpha = pulse;
  px(ctx, sx - 10, groundY - 58 + bob, 20, 8, "#60f0f0");
  ctx.globalAlpha = 1;

  px(ctx, sx - 28, groundY - 72, 56, 14, "rgba(0,0,0,0.35)");
  ctx.fillStyle = "#ffe878";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("DOCK OUT", sx, groundY - 62);
  ctx.textAlign = "left";
}

/** Floating log obstacle — drifts R→L */
export function drawFloatingLog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  time: number,
  w = FLOATING_LOG_W,
  h = FLOATING_LOG_H,
) {
  const sx = x - camX - w / 2;
  const sy = y - h / 2;
  const roll = Math.sin(time / 320 + x * 0.02) * 1.5;

  px(ctx, sx, sy + roll, w, h, "#4a3828");
  px(ctx, sx + 3, sy + 2 + roll, w - 6, h - 4, "#6a5038");
  px(ctx, sx + 8, sy + 4 + roll, w - 16, 3, "#5a4830");
  px(ctx, sx + 14, sy + 9 + roll, w - 28, 2, "#4a3828");
  // Knot
  px(ctx, sx + w * 0.35, sy + 6 + roll, 6, 5, "#3a2818");
  px(ctx, sx + w * 0.62, sy + 7 + roll, 5, 4, "#3a2818");
  // Moss
  px(ctx, sx + 4, sy + h - 5 + roll, 10, 3, "#3a6848");
  px(ctx, sx + w - 14, sy + h - 4 + roll, 8, 2, "#348858");
}

/** Kamikaze gator — surface patrol, then dive to ram */
export function drawKamikazeGator(
  ctx: CanvasRenderingContext2D,
  sx: number,
  y: number,
  w: number,
  h: number,
  time: number,
  facingRight: boolean,
  diving: boolean,
) {
  const midX = sx + w / 2;
  const midY = y + h / 2;
  const frame = Math.floor(time / 140) % GATOR_FRAMES;
  const cache = ensureGatorFrameCache();
  const tilt = diving ? 0.42 : 0;

  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(tilt * (facingRight ? 1 : -1));
  ctx.scale(facingRight ? 1 : -1, 1);

  if (cache?.[frame]) {
    ctx.drawImage(cache[frame], -GATOR_ORIGIN_X, -GATOR_ORIGIN_Y);
  } else {
    drawGatorBakedFrame(ctx, frame);
  }

  if (diving) {
    px(ctx, 30, 4, 12, 4, "#1a3028");
    px(ctx, 32, 5, 3, 1, "#e8f0e8");
    px(ctx, 36, 5, 3, 1, "#e8f0e8");
    px(ctx, 40, 5, 2, 1, "#e8f0e8");
  } else if (Math.sin(time / 95) > -0.15) {
    px(ctx, 26, -4, 2, 2, "#ff6060");
  }

  ctx.restore();
}
