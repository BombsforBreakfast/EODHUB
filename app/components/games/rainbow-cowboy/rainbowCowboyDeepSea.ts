import {
  CREEPER_BURST_DURATION_MS,
  CREEPER_BURST_FAR_SPREAD,
  CREEPER_BURST_HIT_MULT,
  CREEPER_BURST_NEAR_HALF,
  CREEPER_BURST_TILT_DEG,
  CREEPER_CHARGE_MS,
  SEA_MINE_SIZE,
  SONIC_CONE_FAR_SPREAD,
  SONIC_CONE_NEAR_HALF,
  SONIC_WAVE_DURATION_MS,
  VIEW_H,
  VIEW_W,
  WATER_SURFACE_Y,
} from "./rainbowCowboyConstants";
import {
  CREEPER_ORIGIN_X,
  CREEPER_ORIGIN_Y,
  CREEPER_SPRITE_H,
  CREEPER_SPRITE_W,
  ensureCreeperFrameCache,
  drawCreeperChargeLight,
  ensureMineBodyCache,
  ensureSharkFrameCache,
  drawMineBodyFallback,
  drawSharkBakedFrame,
  drawSharkLaserPulse,
  MINE_ORIGIN,
  SHARK_FRAMES,
  SHARK_ORIGIN_X,
  SHARK_ORIGIN_Y,
} from "./rainbowCowboyDeepSeaSprites";
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

/** Distant wrecks, ruins, bubble columns — slow parallax behind gameplay */
export function drawDeepSeaBackground(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
  groundY: number,
) {
  const parallax = camX * 0.12;

  // Bubble columns
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 220 - parallax * 0.6 + time * 0.015) % (VIEW_W + 120)) - 60;
    const baseY = groundY - 40 - i * 30;
    ctx.globalAlpha = 0.12 + (i % 3) * 0.04;
    for (let j = 0; j < 8; j++) {
      const by = baseY - j * 14 - ((time / 80 + i * 17 + j * 11) % 18);
      px(ctx, bx + (j % 2) * 2, by, 3, 3, "#8ad8c8");
      if (j % 3 === 0) px(ctx, bx + 1, by - 2, 2, 2, "#b8f0dc");
    }
    ctx.globalAlpha = 1;
  }

  // Distant wreck silhouettes
  const wrecks = [
    { x: 800, yOff: 80, w: 90, h: 36 },
    { x: 2400, yOff: 60, w: 110, h: 44 },
    { x: 4200, yOff: 70, w: 130, h: 50 },
    { x: 6800, yOff: 55, w: 100, h: 40 },
    { x: 9200, yOff: 75, w: 120, h: 46 },
  ];
  for (const wr of wrecks) {
    const sx = wr.x - parallax * 0.35 - camX * 0.65;
    if (sx < -160 || sx > VIEW_W + 160) continue;
    const wy = groundY - wr.yOff;
    ctx.globalAlpha = 0.22;
    px(ctx, sx, wy - wr.h, wr.w, wr.h, "#0a1828");
    px(ctx, sx + 8, wy - wr.h + 6, wr.w - 16, wr.h - 12, "#122030");
    px(ctx, sx + wr.w * 0.3, wy - wr.h - 16, 12, 16, "#0a1828");
    px(ctx, sx + wr.w * 0.55, wy - wr.h - 10, 8, 10, "#122030");
    ctx.globalAlpha = 1;
  }

  // Underwater ruins — broken columns
  for (let i = 0; i < 6; i++) {
    const rx = i * 480 + 200 - parallax * 0.5;
    const sx = rx - camX * 0.55;
    if (sx < -40 || sx > VIEW_W + 40) continue;
    const colH = 50 + (i % 3) * 20;
    ctx.globalAlpha = 0.18;
    px(ctx, sx, groundY - colH, 10, colH, "#1a2838");
    px(ctx, sx + 2, groundY - colH + 4, 6, colH - 8, "#243448");
    px(ctx, sx - 6, groundY - colH + 12, 22, 6, "#1a2838");
    ctx.globalAlpha = 1;
  }
}

export function drawDeepSeaSky(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, "#0a2e38");
  grad.addColorStop(0.35, "#0e3e48");
  grad.addColorStop(0.7, "#125860");
  grad.addColorStop(1, "#0c4840");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.globalAlpha = 0.06 + Math.sin(time / 900) * 0.02;
  for (let i = 0; i < 4; i++) {
    const ox = ((camX * 0.08 + i * 200 + time * 0.015) % (VIEW_W + 160)) - 80;
    px(ctx, ox, 30 + i * 20, 80, 16, "#58a888");
    px(ctx, ox + 10, 24 + i * 20, 60, 10, "#489878");
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(90,210,170,0.32)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= VIEW_W; x += 8) {
    const wx = x + camX * 0.05;
    const y = WATER_SURFACE_Y + Math.sin(wx / 40 + time / 500) * 3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawDeepSeaFloor(
  ctx: CanvasRenderingContext2D,
  config: LevelConfig,
  camX: number,
) {
  const groundY = config.level.groundY;
  const startTile = Math.floor(camX / 16) * 16;
  for (let x = startTile; x < camX + VIEW_W + 32; x += 16) {
    const sx = x - camX;
    px(ctx, sx, groundY, 16, VIEW_H - groundY, "#1a3028");
    px(ctx, sx, groundY, 16, 6, "#2a4038");
    px(ctx, sx + 2, groundY + 6, 12, 4, "#243830");
    if ((x / 16) % 3 === 0) {
      px(ctx, sx + 4, groundY + 10, 8, 6, "#1e3830");
    }
  }
}

/** Seaweed, coral, debris — foreground parallax in front of player */
export function drawDeepSeaForeground(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
  groundY: number,
) {
  const parallax = camX * 0.25;

  // Seaweed fronds along floor
  for (let i = 0; i < 14; i++) {
    const wx = i * 72 + 30 - parallax;
    const sx = wx - camX * 0.75;
    if (sx < -30 || sx > VIEW_W + 30) continue;
    const sway = Math.sin(time / 280 + i * 0.9) * 4;
    const h = 22 + (i % 4) * 8;
    px(ctx, sx + sway, groundY - h, 4, h, "#1a5038");
    px(ctx, sx + 2 + sway * 0.5, groundY - h + 4, 3, h - 6, "#226848");
    if (i % 2 === 0) {
      px(ctx, sx - 3 + sway, groundY - h + 8, 3, h - 12, "#185030");
    }
  }

  // Coral clusters
  const corals = [
    { x: 400, c: "#c86068" },
    { x: 900, c: "#d87888" },
    { x: 1600, c: "#c86068" },
    { x: 2800, c: "#e08898" },
    { x: 3800, c: "#c86068" },
    { x: 5200, c: "#d87888" },
    { x: 6400, c: "#c86068" },
    { x: 7800, c: "#e08898" },
    { x: 9000, c: "#c86068" },
    { x: 10000, c: "#d87888" },
  ];
  for (const cor of corals) {
    const sx = cor.x - parallax * 0.8 - camX * 0.7;
    if (sx < -30 || sx > VIEW_W + 30) continue;
    px(ctx, sx, groundY - 14, 12, 10, cor.c);
    px(ctx, sx + 2, groundY - 18, 8, 6, "#e8a0a8");
    px(ctx, sx - 4, groundY - 10, 6, 8, "#a84858");
    px(ctx, sx + 8, groundY - 12, 5, 7, "#b85060");
  }

  // Floating debris
  for (let i = 0; i < 8; i++) {
    const dx = i * 340 + 120 - parallax * 0.4;
    const sx = dx - camX * 0.82;
    if (sx < -20 || sx > VIEW_W + 20) continue;
    const dy = groundY - 60 - (i % 3) * 25 + Math.sin(time / 400 + i) * 3;
    px(ctx, sx, dy, 10, 5, "#4a3828");
    px(ctx, sx + 2, dy + 1, 6, 3, "#6a5040");
    px(ctx, sx + 8, dy - 1, 4, 3, "#3a2a20");
  }
}

export function drawDeepSeaPlatform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#4a3828");
  px(ctx, sx, y - 2, w, 3, "#6a5040");
  for (let i = 0; i < w; i += 14) {
    px(ctx, sx + i, y + 2, 10, h - 4, "#3a2a20");
  }
}

export function drawDeepSeaWall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  camX: number,
) {
  const sx = x - camX;
  px(ctx, sx, y, w, h, "#2a3540");
  px(ctx, sx + 2, y + 2, w - 4, h - 4, "#384858");
  for (let row = 0; row < h; row += 12) {
    px(ctx, sx, y + row, w, 2, "#1a2028");
  }
}

export function drawDeepSeaExtraction(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  camX: number,
  time: number,
) {
  const sx = x - camX;
  const pulse = 0.5 + Math.sin(time / 400) * 0.5;
  px(ctx, sx - 50, groundY - 120, 100, 120, "#1a2838");
  px(ctx, sx - 42, groundY - 112, 84, 104, "#243040");
  ctx.strokeStyle = `rgba(80,220,180,${0.4 + pulse * 0.4})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, groundY - 60, 38, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = `rgba(60,200,160,${0.15 + pulse * 0.2})`;
  ctx.fill();
  ctx.fillStyle = "#a0f0d0";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("EXIT", sx, groundY - 58);
  ctx.textAlign = "left";
}

/** Naval mine — baked body atlas + runtime chain sway & arm glow */
export function drawSeaMine(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  groundY: number,
  camX: number,
  time: number,
  armPct = 0,
) {
  const sx = x - camX;
  const s = SEA_MINE_SIZE;
  const armed = armPct > 0.08;
  const cy = y;
  const r = s / 2;

  // Arm glow (animated — stays runtime)
  if (armed) {
    const pulse = 0.55 + Math.sin(time / 55) * 0.45;
    const glow = armPct * (0.2 + pulse * 0.5);
    ctx.globalAlpha = glow;
    px(ctx, sx - r - 10, cy - r - 10, s + 20, s + 20, "#ff3020");
    ctx.globalAlpha = 1;
  }

  // Tether chain (animated sway — stays runtime)
  if (kind === "sea_mine_tethered") {
    const sway = Math.sin(time / 420 + x * 0.008) * 5;
    const chainTop = cy + r - 2;
    const links = 8;
    for (let i = 0; i < links; i++) {
      const t = i / links;
      const lx = sx + sway * t * t;
      const ly = chainTop + t * (groundY - chainTop - 8);
      const wobble = (i % 2) * 2;
      px(ctx, lx - 2 + wobble, ly, 4, 5, armed ? "#6a5048" : "#3a4858");
      px(ctx, lx - 1 + wobble, ly + 1, 2, 3, armed ? "#8a6860" : "#5a6878");
    }
    px(ctx, sx - 6, groundY - 14, 12, 14, "#2a3840");
    px(ctx, sx - 4, groundY - 12, 8, 10, "#3a4850");
    px(ctx, sx - 2, groundY - 10, 4, 4, "#505860");
  }

  const lightOn = armed || Math.sin(time / 120) > 0.1;
  const cache = ensureMineBodyCache();
  const armedIdx = armed ? 1 : 0;
  const lightIdx = lightOn ? 1 : 0;

  if (cache?.[armedIdx]?.[lightIdx]) {
    ctx.drawImage(cache[armedIdx][lightIdx], sx - MINE_ORIGIN, cy - MINE_ORIGIN);
  } else {
    drawMineBodyFallback(ctx, sx, cy, armed, lightOn);
  }
}

export function drawSeaMineExplosion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  time: number,
  explodeUntil: number,
  timeMs: number,
) {
  const t = 1 - (explodeUntil - timeMs) / 1100;
  const sx = x - camX;
  const pulse = 0.5 + Math.sin(time / 35) * 0.35;

  ctx.globalAlpha = (1 - t) * 0.45;
  px(ctx, sx - 12 - t * 36, y - 12 - t * 36, 24 + t * 72, 24 + t * 72, "#50b4dc");
  ctx.globalAlpha = pulse * (1 - t * 0.5);
  px(ctx, sx - 8 - t * 28, y - 8 - t * 28, 16 + t * 56, 16 + t * 56, "#ff6440");
  ctx.globalAlpha = 0.75 * (1 - t);
  px(ctx, sx - 4 - t * 16, y - 4 - t * 16, 8 + t * 32, 8 + t * 32, "#ffc878");
  ctx.globalAlpha = 1;
}

/** Laser shark — baked swim atlas + runtime flip & laser pulse */
export function drawLaserShark(
  ctx: CanvasRenderingContext2D,
  sx: number,
  y: number,
  w: number,
  h: number,
  time: number,
  facingRight: boolean,
) {
  const midX = sx + w / 2;
  const midY = y + h / 2;
  const frame = Math.floor(time / 130) % SHARK_FRAMES;
  const cache = ensureSharkFrameCache();

  ctx.save();
  ctx.translate(midX, midY);
  ctx.scale(facingRight ? 1 : -1, 1);

  if (cache?.[frame]) {
    ctx.drawImage(cache[frame], -SHARK_ORIGIN_X, -SHARK_ORIGIN_Y);
  } else {
    drawSharkBakedFrame(ctx, frame);
  }

  if (Math.sin(time / 90) > -0.2) {
    px(ctx, 27, -3, 2, 2, "#ff6060");
  }

  ctx.restore();

  drawSharkLaserPulse(ctx, midX + (facingRight ? 26 : -26), midY, time, facingRight);
}

/** Floor creeper — baked tread body + runtime charge lamp */
export function drawCreeperMine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  time: number,
  chargeMs: number | null | undefined,
  chargeMaxMs: number,
) {
  const sx = x - camX;
  const cache = ensureCreeperFrameCache();
  const treadFrame = Math.floor(time / 120) % 2;

  if (cache?.[treadFrame]) {
    ctx.drawImage(cache[treadFrame], sx - CREEPER_ORIGIN_X, y - CREEPER_ORIGIN_Y);
  } else {
    ctx.save();
    ctx.translate(sx, y);
    drawCreeperBakedFallback(ctx, treadFrame);
    ctx.restore();
  }

  if (chargeMs != null && chargeMs > 0) {
    const pct = 1 - chargeMs / chargeMaxMs;
    drawCreeperChargeLight(ctx, sx, y, pct, time);
  }
}

function drawCreeperBakedFallback(ctx: CanvasRenderingContext2D, treadFrame: number) {
  const roll = treadFrame % 2;
  px(ctx, -26, 4, 52, 8, "#283038");
  px(ctx, -22, -6, 44, 14, "#2a3038");
  px(ctx, -22 + roll * 3, 6, 5, 3, "#1a2028");
}

export type HostileSonicBurstDraw = {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  length: number;
  maxLength: number;
  bornMs: number;
};

export function hostileBurstHalfWidth(length: number, along: number, forHit = false): number {
  if (length <= 0) return CREEPER_BURST_NEAR_HALF;
  const t = Math.max(0, Math.min(1, along / length));
  let half = CREEPER_BURST_NEAR_HALF + t * length * CREEPER_BURST_FAR_SPREAD;
  if (forHit) half *= CREEPER_BURST_HIT_MULT;
  return half;
}

export function pointInHostileBurst(
  burst: HostileSonicBurstDraw,
  px: number,
  py: number,
): boolean {
  const length = burst.length;
  if (length < 6) return false;
  const dx = px - burst.x;
  const dy = py - burst.y;
  const along = dx * burst.dirX + dy * burst.dirY;
  if (along < -4 || along > length + 4) return false;
  const clamped = Math.max(0, Math.min(length, along));
  const halfW = hostileBurstHalfWidth(length, clamped, true);
  const perp = Math.abs(dx * -burst.dirY + dy * burst.dirX);
  return perp <= halfW;
}

export function rectIntersectsHostileBurst(
  burst: HostileSonicBurstDraw,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const pts = [
    { x: r.x + r.w / 2, y: r.y + r.h / 2 },
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
  return pts.some((p) => pointInHostileBurst(burst, p.x, p.y));
}

/** Upward sonic fan from creeper mine — straight up plus ±10° */
export function drawHostileSonicBursts(
  ctx: CanvasRenderingContext2D,
  bursts: HostileSonicBurstDraw[],
  camX: number,
  timeMs: number,
) {
  for (const burst of bursts) {
    const age = timeMs - burst.bornMs;
    const t = Math.min(1, age / CREEPER_BURST_DURATION_MS);
    const alpha = 0.55 * (1 - t * 0.85);
    const length = burst.length;
    if (length < 8) continue;

    const slice = 8;
    ctx.globalAlpha = alpha;
    for (let along = 0; along < length; along += slice) {
      const halfH = hostileBurstHalfWidth(length, along);
      const cx = burst.x + burst.dirX * along - camX;
      const cy = burst.y + burst.dirY * along;
      const depth = along / length;
      const col =
        depth > 0.72 ? "#c84858" : depth > 0.38 ? "#e86878" : "#ff8898";
      const perpX = -burst.dirY;
      const perpY = burst.dirX;
      const rows = Math.max(3, Math.ceil(halfH / 10));
      for (let row = -rows; row <= rows; row++) {
        const t = row / rows;
        const rowHalf = halfH * (1 - Math.abs(t) * 0.15);
        px(
          ctx,
          cx + perpX * rowHalf - slice / 2,
          cy + perpY * rowHalf - 3,
          slice,
          5,
          col,
        );
      }
    }

    ctx.globalAlpha = alpha * 0.9;
    const tipX = burst.x + burst.dirX * length - camX;
    const tipY = burst.y + burst.dirY * length;
    px(ctx, burst.x - camX - 3, burst.y - 3, 6, 6, "#fff");
    px(ctx, tipX - 2, tipY - 2, 4, 4, "rgba(255,180,180,0.45)");
    ctx.globalAlpha = 1;
  }
}

export function creeperBurstDirections(): { dirX: number; dirY: number }[] {
  const tilt = (CREEPER_BURST_TILT_DEG * Math.PI) / 180;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  return [
    { dirX: 0, dirY: -1 },
    { dirX: -sin, dirY: -cos },
    { dirX: sin, dirY: -cos },
  ];
}

/** Ray length from floor emitter to the water surface along a burst ray. */
export function creeperBurstMaxLength(
  originY: number,
  dirX: number,
  dirY: number,
): number {
  const targetY = WATER_SURFACE_Y - 16;
  const rise = originY - targetY;
  return Math.ceil(rise / -dirY);
}

export function drawSpearProjectile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  camX: number,
  dir: number,
) {
  const sx = x - camX;
  px(ctx, sx - 8, y - 2, 16, 4, "#667788");
  const tip = dir > 0 ? sx + 10 : sx - 10;
  px(ctx, tip - (dir > 0 ? 0 : 6), y - 3, 6, 6, "#ccddee");
  px(ctx, tip + (dir > 0 ? 4 : -10), y - 1, 4, 3, "#ddeeff");
}

export type SonicWaveDraw = {
  x: number;
  y: number;
  dir: 1 | -1;
  radius: number;
  bornMs: number;
};

export function sonicConeHalfWidth(length: number, along: number): number {
  if (length <= 0) return SONIC_CONE_NEAR_HALF;
  const t = Math.max(0, Math.min(1, along / length));
  return SONIC_CONE_NEAR_HALF + t * length * SONIC_CONE_FAR_SPREAD;
}

export function pointInSonicCone(
  wave: SonicWaveDraw,
  px: number,
  py: number,
): boolean {
  const length = wave.radius;
  if (length < 6) return false;
  const along = (px - wave.x) * wave.dir;
  if (along < -4 || along > length + 4) return false;
  const clamped = Math.max(0, Math.min(length, along));
  return Math.abs(py - wave.y) <= sonicConeHalfWidth(length, clamped) + 2;
}

export function rectIntersectsSonicCone(wave: SonicWaveDraw, r: Rect): boolean {
  const pts = [
    { x: r.x + r.w / 2, y: r.y + r.h / 2 },
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
  return pts.some((p) => pointInSonicCone(wave, p.x, p.y));
}

type Rect = { x: number; y: number; w: number; h: number };

/** Forward-expanding sonic cone — px style */
export function drawSonicWaves(
  ctx: CanvasRenderingContext2D,
  waves: SonicWaveDraw[],
  camX: number,
  timeMs: number,
) {
  for (const wave of waves) {
    const sx = wave.x - camX;
    const age = timeMs - wave.bornMs;
    const t = Math.min(1, age / SONIC_WAVE_DURATION_MS);
    const length = wave.radius;
    const alpha = 0.6 * (1 - t * 0.85);
    if (length < 8) continue;

    ctx.globalAlpha = alpha;
    const slice = 8;
    for (let along = 0; along < length; along += slice) {
      const halfH = sonicConeHalfWidth(length, along);
      const rowH = Math.max(4, halfH * 2);
      const rowY = wave.y - halfH;
      const depth = along / length;
      const col =
        depth > 0.72 ? "#2898b8" : depth > 0.38 ? "#44c8e8" : "#66eeff";
      const rowX = wave.dir > 0 ? sx + along : sx - along - slice;
      px(ctx, rowX, rowY, slice, rowH, col);
    }

    // Diagonal edge caps — read as cone, not rectangle
    const tipHalf = sonicConeHalfWidth(length, length);
    const edgeCol = "#a8f8ff";
    for (let e = 0; e < 3; e++) {
      const back = length - e * 10;
      if (back < 0) continue;
      const hh = sonicConeHalfWidth(length, back);
      const ex = wave.dir > 0 ? sx + back : sx - back - 4;
      px(ctx, ex, wave.y - hh - 3, 4, 4, edgeCol);
      px(ctx, ex, wave.y + hh - 1, 4, 4, edgeCol);
    }

    ctx.globalAlpha = alpha * 0.85;
    px(ctx, sx - 3, wave.y - 3, 6, 6, "#fff");
    px(ctx, wave.dir > 0 ? sx + length - 4 : sx - length, wave.y - tipHalf, 4, tipHalf * 2, "rgba(168,248,255,0.35)");
    ctx.globalAlpha = 1;
  }
}
