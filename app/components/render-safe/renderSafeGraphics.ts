import {
  MAP_COLS,
  MAP_ROWS,
  PLAYER_ACCENT_COLOR,
  PLAYER_BODY_COLOR,
  TILE_SIZE,
  getTile,
  isWalkableTile,
  type RenderSafeTile,
} from "./renderSafeMap";
import {
  drawPathAutotileOverlay,
  drawStartMarker,
  drawWallAutotileOverlay,
  isPathLike,
  type PlayerFacing,
} from "./renderSafeAutotile";

export type { PlayerFacing };

export function tileVariant(col: number, row: number): number {
  return (col * 17 + row * 31) % 3;
}

let cachedNoisePattern: CanvasPattern | null = null;

/** One-time 32×32 noise tile (~4KB RAM). Zero asset storage. */
function getNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (cachedNoisePattern) return cachedNoisePattern;
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
  cachedNoisePattern = ctx.createPattern(off, "repeat");
  return cachedNoisePattern;
}

function applySurfaceNoise(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  const pattern = getNoisePattern(ctx);
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

function neighborTile(col: number, row: number, dc: number, dr: number): RenderSafeTile {
  return getTile(col + dc, row + dr);
}

function touchesPath(col: number, row: number): boolean {
  for (const [dc, dr] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const t = neighborTile(col, row, dc, dr);
    if (t === "path" || t === "start" || t === "bridge" || t === "target") return true;
  }
  return false;
}

function touchesWater(col: number, row: number): boolean {
  for (const [dc, dr] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    if (neighborTile(col, row, dc, dr) === "water") return true;
  }
  return false;
}

/** Soft fringe where terrain meets the trail. */
function drawTerrainEdgeBlend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
  tile: RenderSafeTile,
) {
  if (tile !== "grass" && tile !== "brush") return;
  if (!touchesPath(col, row)) return;

  ctx.fillStyle = tile === "brush" ? "rgba(74,63,46,0.35)" : "rgba(74,63,46,0.28)";
  if (isWalkableTile(neighborTile(col, row, 0, -1))) ctx.fillRect(x, y, TILE_SIZE, 3);
  if (isWalkableTile(neighborTile(col, row, 0, 1))) ctx.fillRect(x, y + TILE_SIZE - 3, TILE_SIZE, 3);
  if (isWalkableTile(neighborTile(col, row, -1, 0))) ctx.fillRect(x, y, 3, TILE_SIZE);
  if (isWalkableTile(neighborTile(col, row, 1, 0))) ctx.fillRect(x + TILE_SIZE - 3, y, 3, TILE_SIZE);
}

function drawGrassTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
  brush: boolean,
) {
  const v = tileVariant(col, row);
  const base = brush ? "#1a2e18" : "#1e3220";
  const mid = brush ? "#243824" : "#2a4228";
  const hi = brush ? "#2e4430" : "#345a34";

  ctx.fillStyle = base;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = mid;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  ctx.fillStyle = hi;
  const clumps: Array<[number, number, number, number]> = brush
    ? [
        [4, 5, 6, 5],
        [11, 12, 5, 4],
        [6, 14, 7, 4],
      ]
    : [
        [3 + v, 4, 5, 4],
        [12, 9 + v, 4, 3],
        [7, 14, 6, 3],
      ];
  for (const [cx, cy, w, h] of clumps) {
    ctx.fillRect(x + cx, y + cy, w, h);
  }

  if (brush) {
    ctx.fillStyle = "#142214";
    ctx.fillRect(x + 2, y + 8, 5, 8);
    ctx.fillRect(x + 14, y + 6, 4, 9);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x + 4 + i * 5, y + 3, 2, 12);
    }
  }

  applySurfaceNoise(ctx, x, y, brush ? 0.05 : 0.07);
}

function drawPathCornerAO(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  const wall = (dc: number, dr: number) => neighborTile(col, row, dc, dr) === "wall";
  if (wall(0, -1)) ctx.fillRect(x, y, TILE_SIZE, 2);
  if (wall(0, 1)) ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
  if (wall(-1, 0)) ctx.fillRect(x, y, 2, TILE_SIZE);
  if (wall(1, 0)) ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE);
}

function drawPathTile(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number) {
  const v = tileVariant(col, row);
  ctx.fillStyle = "#3a3224";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#4f4534";
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.fillStyle = "#5a5038";
  ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x + 3, y + TILE_SIZE - 5, TILE_SIZE - 6, 2);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, 1);

  ctx.fillStyle = "#6a5e48";
  const pebbles = [
    [4 + v, 7],
    [10, 12],
    [15, 5],
  ];
  for (const [px, py] of pebbles) {
    ctx.fillRect(x + px, y + py, 2, 2);
  }

  if (v === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x + 8, y + 4, 2, TILE_SIZE - 8);
  }

  ctx.fillStyle = "rgba(0,0,0,0.11)";
  ctx.fillRect(x + 5, y + 2, 2, TILE_SIZE - 4);
  ctx.fillRect(x + 13, y + 2, 2, TILE_SIZE - 4);

  drawPathCornerAO(ctx, x, y, col, row);
  drawPathAutotileOverlay(ctx, x, y, col, row);
  applySurfaceNoise(ctx, x, y, 0.05);
}

function drawStartTile(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number, time: number) {
  drawPathTile(ctx, x, y, col, row);
  drawStartMarker(ctx, x, y, time);
}

function drawWallTile(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number) {
  const northWall = neighborTile(col, row, 0, -1) === "wall";
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = northWall ? "#363636" : "#404040";
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 3);
  ctx.fillStyle = northWall ? "#484848" : "#565656";
  ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, 4);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x + 2, y + TILE_SIZE - 4, TILE_SIZE - 4, 3);
  if (!northWall) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, 1);
  }
  drawWallAutotileOverlay(ctx, x, y, col, row);
  applySurfaceNoise(ctx, x, y, 0.04);
}

function drawRockTile(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number) {
  const v = tileVariant(col, row);
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.ellipse(x + 10, y + 12 + v, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(x + 6, y + 8, 6, 4);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 7, y + 9, 3, 1);
  applySurfaceNoise(ctx, x, y, 0.04);
}

function drawWaterTile(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number, time: number) {
  const grad = ctx.createLinearGradient(x, y, x, y + TILE_SIZE);
  grad.addColorStop(0, "#1a3454");
  grad.addColorStop(1, "#0f2438");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.fillStyle = "rgba(100,160,220,0.12)";
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 3);

  ctx.fillStyle = "rgba(140,190,240,0.25)";
  for (let i = 0; i < 3; i++) {
    const wave = Math.sin(time / 500 + col * 0.8 + i * 1.4) * 1.5;
    ctx.fillRect(x + 3 + i * 5, y + 9 + wave, 4, 1);
  }

  if (touchesWater(col, row) || touchesPath(col, row)) {
    ctx.fillStyle = "rgba(180,210,240,0.08)";
    ctx.fillRect(x, y, TILE_SIZE, 2);
  }
  applySurfaceNoise(ctx, x, y, 0.04);
}

function drawBridgeTile(ctx: CanvasRenderingContext2D, x: number, y: number, col: number, row: number) {
  ctx.fillStyle = "#1a2838";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#3d3024";
  ctx.fillRect(x, y + 1, TILE_SIZE, TILE_SIZE - 2);
  ctx.fillStyle = "#5a4838";
  ctx.fillRect(x + 1, y + 3, TILE_SIZE - 2, TILE_SIZE - 6);
  ctx.fillStyle = "#6e5c48";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 2 + i * 4, y + 4, 3, TILE_SIZE - 8);
  }
  ctx.fillStyle = "#2a2018";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 5 + i * 5, y + TILE_SIZE - 5, 2, 2);
  }
  ctx.strokeStyle = "#4a3828";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 1, y + 2, TILE_SIZE - 2, TILE_SIZE - 4);
  if (neighborTile(col, row, 0, -1) === "water" || neighborTile(col, row, 0, 1) === "water") {
    ctx.fillStyle = "rgba(100,160,220,0.15)";
    ctx.fillRect(x, y, TILE_SIZE, 2);
    ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
  }
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x + 2, y + 4, TILE_SIZE - 4, 1);
  applySurfaceNoise(ctx, x, y, 0.05);
}

function drawTargetTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
  time: number,
) {
  const northTarget = neighborTile(col, row, 0, -1) === "target";
  ctx.fillStyle = "#181820";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "#222228";
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.fillStyle = northTarget ? "#3a3a44" : "#4a4a56";
  ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);

  if (!northTarget) {
    ctx.fillStyle = "#2a2a32";
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + TILE_SIZE / 2, y);
    ctx.lineTo(x + TILE_SIZE - 3, y + 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#2a2a32";
  ctx.fillRect(x + 8, y + 8, 4, 5);
  ctx.fillRect(x + TILE_SIZE - 12, y + 8, 4, 5);

  const flicker = Math.sin(time / 900) > 0.2 ? 0.85 : 0.35;
  ctx.fillStyle = `rgba(255, 180, 80, ${flicker * 0.55})`;
  ctx.fillRect(x + 9, y + 10, 3, 3);
  ctx.fillRect(x + TILE_SIZE - 11, y + 10, 3, 3);

  if (!northTarget) {
    const glow = ctx.createRadialGradient(
      x + TILE_SIZE / 2,
      y + TILE_SIZE - 2,
      0,
      x + TILE_SIZE / 2,
      y + TILE_SIZE,
      18,
    );
    glow.addColorStop(0, `rgba(255,180,80,${flicker * 0.18})`);
    glow.addColorStop(1, "rgba(255,180,80,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 2, y + 6, TILE_SIZE + 4, TILE_SIZE);
  }

  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, 1);
  applySurfaceNoise(ctx, x, y, 0.04);
}

export function drawEnhancedTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  tile: RenderSafeTile,
  time: number,
) {
  if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return;

  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;

  switch (tile) {
    case "grass":
      drawGrassTile(ctx, x, y, col, row, false);
      break;
    case "brush":
      drawGrassTile(ctx, x, y, col, row, true);
      break;
    case "path":
      drawPathTile(ctx, x, y, col, row);
      break;
    case "start":
      drawStartTile(ctx, x, y, col, row, time);
      break;
    case "wall":
      drawWallTile(ctx, x, y, col, row);
      break;
    case "rock":
      drawRockTile(ctx, x, y, col, row);
      break;
    case "water":
      drawWaterTile(ctx, x, y, col, row, time);
      break;
    case "bridge":
      drawBridgeTile(ctx, x, y, col, row);
      break;
    case "target":
      drawTargetTile(ctx, x, y, col, row, time);
      break;
    default:
      ctx.fillStyle = "#1a2a1a";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  drawTerrainEdgeBlend(ctx, x, y, col, row, tile);
}

export function drawGroundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 6 * scale, 7 * scale, 3 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawOperatorSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bodyColor: string,
  accentColor: string,
  scale = 1,
  isLeader = false,
  facing: PlayerFacing = "up",
) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (facing === "left") ctx.scale(-scale, scale);
  else if (facing === "right") ctx.scale(scale, scale);
  else ctx.scale(scale, scale);

  drawGroundShadow(ctx, 0, facing === "down" ? 1 : 0, facing === "down" ? 1.15 : 1);

  const headY = facing === "down" ? -7 : -10;
  const bodyW = facing === "down" ? 14 : 12;
  const packX = facing === "right" ? -6 : 3;

  if (isLeader && facing !== "down") {
    ctx.fillStyle = "#2a3018";
    ctx.fillRect(packX, -4, 6, 5);
  }

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.ellipse(0, headY, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(-6, headY - 1, 12, 2);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(-bodyW / 2, -5, bodyW, 9);
  ctx.fillStyle = "#3a4018";
  ctx.fillRect(-5, -3, 10, 5);
  if (isLeader) {
    ctx.fillStyle = "#5a6030";
    ctx.fillRect(-2, -2, 4, 3);
  }

  const legOff = facing === "down" ? 6 : 5;
  ctx.fillStyle = "#2f3418";
  ctx.fillRect(-legOff, 4, 4, 5);
  ctx.fillRect(1, 4, 4, 5);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-legOff, 8, 4, 1);
  ctx.fillRect(1, 8, 4, 1);

  ctx.fillStyle = "#111";
  ctx.fillRect(-2, headY + 1, 4, 2);
  ctx.fillStyle = "rgba(60,120,80,0.45)";
  ctx.fillRect(-2, headY + 2, 4, 1);

  ctx.restore();
}

export function drawChemlightAmbient(
  ctx: CanvasRenderingContext2D,
  markers: Array<{ col: number; row: number }>,
  startRow: number,
  endRow: number,
  time: number,
) {
  for (const cl of markers) {
    if (cl.row < startRow || cl.row >= endRow) continue;
    const cx = cl.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = cl.row * TILE_SIZE + TILE_SIZE / 2;
    const pulse = 0.85 + Math.sin(time / 220 + cl.col) * 0.15;
    const r = TILE_SIZE * 1.65 * pulse;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(255,180,80,0.14)");
    grad.addColorStop(0.5, "rgba(249,115,22,0.06)");
    grad.addColorStop(1, "rgba(249,115,22,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawAssaultSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale = 1,
  time = 0,
  facing: PlayerFacing = "up",
) {
  const bob = Math.sin(time / 240 + x * 0.05) * 0.5;
  drawOperatorSprite(ctx, x, y + bob, "#4a5568", "#718096", scale, false, facing);
}

export function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time = 0,
  facing: PlayerFacing = "up",
) {
  const bob = Math.sin(time / 180) * 0.7;
  drawOperatorSprite(ctx, x, y + bob, PLAYER_BODY_COLOR, PLAYER_ACCENT_COLOR, 1, true, facing);
}

export function drawChemlightGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
) {
  const pulse = 0.85 + Math.sin(time / 220) * 0.15;
  const r = 10 * pulse;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, "rgba(255,180,80,0.55)");
  grad.addColorStop(0.45, "rgba(249,115,22,0.25)");
  grad.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f97316";
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
  ctx.fillStyle = "#fde68a";
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
}

/** Night-vision mood: moonlight, NVG tint, vignette (viewport space). */
export function drawAtmosphereOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const moonlight = ctx.createLinearGradient(0, 0, width * 0.55, height * 0.45);
  moonlight.addColorStop(0, "rgba(160,190,210,0.12)");
  moonlight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = moonlight;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(28, 48, 58, 0.11)";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(36,72,48,0.045)";
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(width, height) * 0.72;
  const vignette = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, "rgba(0,0,0,0.1)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(0,0,0,0.03)";
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1);
  }
}
