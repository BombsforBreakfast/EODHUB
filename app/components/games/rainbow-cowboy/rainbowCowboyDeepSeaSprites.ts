import { SEA_MINE_SIZE } from "./rainbowCowboyConstants";

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

/* ─── Laser shark atlas (4 tail frames, facing right) ─── */

export const SHARK_SPRITE_W = 80;
export const SHARK_SPRITE_H = 52;
export const SHARK_ORIGIN_X = 42;
export const SHARK_ORIGIN_Y = 26;
export const SHARK_FRAMES = 4;

const SHARK = {
  body: "#1a4858",
  bodyMid: "#286070",
  bodyHi: "#307888",
  bodyEdge: "#143040",
  fin: "#143848",
  finHi: "#1a5060",
  belly: "#3a7888",
  bellyHi: "#4a8898",
  spot: "#225868",
  scar: "#3a6878",
  eye: "#ff2020",
  eyeHi: "#ff6060",
  teeth: "#d8e8f0",
  cannon: "#404850",
  cannonHi: "#586868",
  mount: "#303840",
  laser: "#44eeff",
  laserCore: "#a8f8ff",
} as const;

/** Tail wag + dorsal sway baked per frame */
const SHARK_POSE: [number, number][] = [
  [0, 0],
  [4, 2],
  [0, 3],
  [-4, 2],
];

export function drawSharkBakedFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const [tailWag, finWave] = SHARK_POSE[frame % SHARK_FRAMES];

  // Forked tail
  px(ctx, -38 + tailWag, -12, 10, 8, SHARK.fin);
  px(ctx, -40 + tailWag * 1.2, -4, 8, 10, SHARK.finHi);
  px(ctx, -38 + tailWag, 4, 10, 8, SHARK.fin);
  px(ctx, -44 + tailWag * 1.4, -2, 6, 6, SHARK.fin);
  px(ctx, -34 + tailWag, 0, 6, 4, SHARK.bodyEdge);

  // Torpedo body
  px(ctx, -28, -10, 52, 20, SHARK.bodyEdge);
  px(ctx, -26, -8, 48, 16, SHARK.body);
  px(ctx, -22, -6, 40, 12, SHARK.bodyMid);
  px(ctx, -18, -2, 32, 6, SHARK.belly);
  px(ctx, -14, 0, 24, 4, SHARK.bellyHi);
  px(ctx, -8, -5, 8, 3, SHARK.spot);
  px(ctx, 2, 2, 10, 2, SHARK.scar);

  // Snout + jaw
  px(ctx, 22, -6, 14, 12, SHARK.body);
  px(ctx, 28, -4, 10, 8, SHARK.bodyMid);
  px(ctx, 34, -2, 6, 4, SHARK.bodyHi);
  px(ctx, 26, 2, 12, 2, SHARK.bodyEdge);
  px(ctx, 28, 3, 3, 1, SHARK.teeth);
  px(ctx, 32, 3, 3, 1, SHARK.teeth);
  px(ctx, 36, 3, 2, 1, SHARK.teeth);

  // Dorsal fin
  px(ctx, 4, -18 + finWave, 12, 16, SHARK.fin);
  px(ctx, 6, -22 + finWave, 8, 12, SHARK.finHi);
  px(ctx, 7, -26 + finWave, 6, 8, SHARK.fin);
  // Secondary dorsal
  px(ctx, -8, -14 + finWave * 0.5, 6, 8, SHARK.fin);

  // Pectoral fins
  px(ctx, 6, 6 + finWave * 0.4, 12, 6, SHARK.fin);
  px(ctx, 8, 8 + finWave * 0.4, 8, 4, SHARK.finHi);
  px(ctx, -4, 7 + finWave * 0.3, 8, 5, SHARK.fin);

  // Gill slits
  for (let g = 0; g < 4; g++) {
    px(ctx, 14 + g * 3, 2, 2, 4, SHARK.fin);
  }

  // Eye socket + glow
  px(ctx, 24, -4, 7, 6, "#0a1820");
  px(ctx, 25, -3, 5, 4, SHARK.eye);
  px(ctx, 27, -3, 2, 2, SHARK.eyeHi);

  // Laser mount + cannon
  px(ctx, 0, -16, 16, 8, SHARK.mount);
  px(ctx, 2, -15, 12, 6, SHARK.cannon);
  px(ctx, 4, -14, 10, 4, SHARK.cannonHi);
  px(ctx, 14, -13, 8, 5, SHARK.cannon);
  px(ctx, 20, -12, 6, 4, SHARK.laser);
  px(ctx, 22, -11, 4, 3, SHARK.laserCore);
  px(ctx, 1, -12, 3, 2, SHARK.mount);
  px(ctx, 8, -17, 3, 2, SHARK.mount);
}

let sharkFrameCache: HTMLCanvasElement[] | null = null;

export function ensureSharkFrameCache(): HTMLCanvasElement[] | null {
  if (sharkFrameCache) return sharkFrameCache;
  if (typeof document === "undefined") return null;

  sharkFrameCache = [];
  for (let f = 0; f < SHARK_FRAMES; f++) {
    const canvas = document.createElement("canvas");
    canvas.width = SHARK_SPRITE_W;
    canvas.height = SHARK_SPRITE_H;
    const bctx = canvas.getContext("2d");
    if (!bctx) continue;
    bctx.translate(SHARK_ORIGIN_X, SHARK_ORIGIN_Y);
    drawSharkBakedFrame(bctx, f);
    sharkFrameCache[f] = canvas;
  }
  return sharkFrameCache;
}

export function drawSharkLaserPulse(
  ctx: CanvasRenderingContext2D,
  cannonTipX: number,
  midY: number,
  time: number,
  facingRight: boolean,
) {
  if (Math.sin(time / 70) <= 0.3) return;
  const dir = facingRight ? 1 : -1;
  px(ctx, cannonTipX + dir * 2, midY - 9, 4, 3, SHARK.laserCore);
  px(ctx, cannonTipX + dir * 5, midY - 8, 3, 2, "#fff");
}

/* ─── Sea mine atlas (armed × light-on) ─── */

export const MINE_SPRITE_SIZE = 56;
export const MINE_ORIGIN = MINE_SPRITE_SIZE / 2;

const MINE = {
  spike: "#4a5058",
  spikeTip: "#686878",
  spikeHot: "#5a4048",
  spikeTipHot: "#7a5860",
  body: "#2a3038",
  bodyMid: "#3a4248",
  bodyHi: "#4a5058",
  bodyHot: "#3a2828",
  bodyMidHot: "#4a3838",
  bodyHiHot: "#5a4848",
  rust: "#5a4030",
  barnacle: "#6a7870",
  rivet: "#586068",
  fuse: "#484850",
  lightOff: "#802820",
  lightOn: "#ff5030",
  lightCore: "#ffc840",
  shackle: "#505860",
} as const;

function drawMineSpikes(ctx: CanvasRenderingContext2D, armed: boolean, r: number) {
  const dirs: [number, number][] = [
    [0, -1],
    [0.7, -0.7],
    [1, 0],
    [0.7, 0.7],
    [0, 1],
    [-0.7, 0.7],
    [-1, 0],
    [-0.7, -0.7],
  ];
  const spikeCol = armed ? MINE.spikeHot : MINE.spike;
  const tipCol = armed ? MINE.spikeTipHot : MINE.spikeTip;
  for (let i = 0; i < dirs.length; i++) {
    const [dx, dy] = dirs[i];
    const len = 9 + (i % 2) * 2;
    px(ctx, dx * (r + 1) - 2, dy * (r + 1) - 2, Math.abs(dx) > 0.5 ? 5 : 4, Math.abs(dy) > 0.5 ? 5 : 4, spikeCol);
    px(ctx, dx * (r + len) - 2, dy * (r + len) - 2, 3, 3, tipCol);
  }
}

function drawMineBodyBaked(ctx: CanvasRenderingContext2D, armed: boolean, lightOn: boolean) {
  const r = SEA_MINE_SIZE / 2;
  const body = armed ? MINE.bodyHot : MINE.body;
  const bodyMid = armed ? MINE.bodyMidHot : MINE.bodyMid;
  const bodyHi = armed ? MINE.bodyHiHot : MINE.bodyHi;

  drawMineSpikes(ctx, armed, r);

  // Spherical hull
  px(ctx, -r + 4, -r + 2, SEA_MINE_SIZE - 8, SEA_MINE_SIZE - 4, body);
  px(ctx, -r + 6, -r + 4, SEA_MINE_SIZE - 12, SEA_MINE_SIZE - 8, bodyMid);
  px(ctx, -r + 10, -r + 8, SEA_MINE_SIZE - 20, SEA_MINE_SIZE - 16, bodyHi);
  px(ctx, -8, -8, 16, 12, bodyMid);
  px(ctx, -6, -6, 12, 8, bodyHi);

  // Equator rivets
  for (let i = -14; i <= 10; i += 7) {
    px(ctx, i, -1, 3, 2, MINE.rivet);
  }

  // Rust + barnacles
  px(ctx, -10, 4, 6, 5, MINE.rust);
  px(ctx, 8, -6, 4, 4, MINE.barnacle);
  px(ctx, 10, -4, 3, 2, "#8a9890");
  px(ctx, -6, -10, 4, 3, MINE.rust);

  // Top fuse housing
  px(ctx, -6, -r + 1, 12, 5, MINE.fuse);
  px(ctx, -4, -r - 1, 8, 3, MINE.fuse);

  // Warning light
  if (lightOn) {
    px(ctx, -5, -r + 2, 10, 6, MINE.lightOn);
    px(ctx, -3, -r + 3, 6, 4, MINE.lightCore);
    if (armed) px(ctx, -1, -r + 4, 2, 2, "#fff8a0");
  } else {
    px(ctx, -4, -r + 3, 8, 4, MINE.lightOff);
  }

  // Bottom shackle (tether attach)
  px(ctx, -5, r - 3, 10, 4, MINE.shackle);
  px(ctx, -3, r - 1, 6, 3, "#686878");
}

let mineBodyCache: HTMLCanvasElement[][] | null = null;

export function ensureMineBodyCache(): HTMLCanvasElement[][] | null {
  if (mineBodyCache) return mineBodyCache;
  if (typeof document === "undefined") return null;

  mineBodyCache = [[], []];
  for (let armed = 0; armed < 2; armed++) {
    for (let light = 0; light < 2; light++) {
      const canvas = document.createElement("canvas");
      canvas.width = MINE_SPRITE_SIZE;
      canvas.height = MINE_SPRITE_SIZE;
      const bctx = canvas.getContext("2d");
      if (!bctx) continue;
      bctx.translate(MINE_ORIGIN, MINE_ORIGIN);
      drawMineBodyBaked(bctx, armed === 1, light === 1);
      mineBodyCache[armed][light] = canvas;
    }
  }
  return mineBodyCache;
}

/** Fallback bake for SSR — draws body only at sx,cy */
export function drawMineBodyFallback(
  ctx: CanvasRenderingContext2D,
  sx: number,
  cy: number,
  armed: boolean,
  lightOn: boolean,
) {
  ctx.save();
  ctx.translate(sx, cy);
  drawMineBodyBaked(ctx, armed, lightOn);
  ctx.restore();
}

export function drawSharkFrameFallback(
  ctx: CanvasRenderingContext2D,
  midX: number,
  midY: number,
  frame: number,
  facingRight: boolean,
) {
  ctx.save();
  ctx.translate(midX, midY);
  ctx.scale(facingRight ? 1 : -1, 1);
  drawSharkBakedFrame(ctx, frame);
  ctx.restore();
}

/* ─── Creeper mine (floor crawler) atlas ─── */

export const CREEPER_SPRITE_W = 60;
export const CREEPER_SPRITE_H = 36;
export const CREEPER_ORIGIN_X = 30;
export const CREEPER_ORIGIN_Y = 28;

const CREEPER = {
  tread: "#283038",
  treadHi: "#384850",
  body: "#2a3038",
  bodyMid: "#3a4248",
  bodyHi: "#4a5058",
  spike: "#505860",
  horn: "#606870",
  sensor: "#802820",
  sensorHot: "#ff4030",
  lens: "#ffc840",
} as const;

function drawCreeperBaked(ctx: CanvasRenderingContext2D, treadFrame: number) {
  const roll = treadFrame % 2;

  // Tread tracks
  px(ctx, -26, 4, 52, 8, CREEPER.tread);
  px(ctx, -24, 5, 48, 6, CREEPER.treadHi);
  for (let i = -22; i <= 16; i += 8) {
    px(ctx, i + roll * 3, 6, 5, 3, "#1a2028");
  }

  // Low hull
  px(ctx, -22, -6, 44, 14, CREEPER.body);
  px(ctx, -20, -4, 40, 10, CREEPER.bodyMid);
  px(ctx, -16, -2, 32, 6, CREEPER.bodyHi);

  // Spikes along back
  for (let i = -14; i <= 12; i += 7) {
    px(ctx, i, -10, 3, 5, CREEPER.spike);
    px(ctx, i + 1, -12, 2, 3, CREEPER.horn);
  }

  // Sonic emitter dish (points up)
  px(ctx, -8, -14, 16, 6, CREEPER.bodyMid);
  px(ctx, -6, -16, 12, 4, CREEPER.bodyHi);
  px(ctx, -4, -18, 8, 3, CREEPER.horn);

  // Sensor eye (runtime overlay fills when charging)
  px(ctx, 10, -8, 8, 6, CREEPER.sensor);
  px(ctx, 11, -7, 6, 4, "#602028");
}

let creeperFrameCache: HTMLCanvasElement[] | null = null;

export function ensureCreeperFrameCache(): HTMLCanvasElement[] | null {
  if (creeperFrameCache) return creeperFrameCache;
  if (typeof document === "undefined") return null;

  creeperFrameCache = [];
  for (let f = 0; f < 2; f++) {
    const canvas = document.createElement("canvas");
    canvas.width = CREEPER_SPRITE_W;
    canvas.height = CREEPER_SPRITE_H;
    const bctx = canvas.getContext("2d");
    if (!bctx) continue;
    bctx.translate(CREEPER_ORIGIN_X, CREEPER_ORIGIN_Y);
    drawCreeperBaked(bctx, f);
    creeperFrameCache[f] = canvas;
  }
  return creeperFrameCache;
}

export function drawCreeperChargeLight(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  chargePct: number,
  time: number,
) {
  const pulse = 0.55 + Math.sin(time / 45) * 0.45;
  const hot = chargePct > 0.55 ? 1 : chargePct * 1.8;
  ctx.globalAlpha = hot * (0.5 + pulse * 0.5);
  px(ctx, sx + 8, sy - 16, 10, 8, CREEPER.sensorHot);
  px(ctx, sx + 10, sy - 14, 6, 5, CREEPER.lens);
  if (chargePct > 0.7) {
    px(ctx, sx + 12, sy - 13, 2, 2, "#fff");
  }
  ctx.globalAlpha = 1;
}
