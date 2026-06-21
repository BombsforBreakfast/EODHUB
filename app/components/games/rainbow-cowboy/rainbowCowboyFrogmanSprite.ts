import {
  PLAYER_H,
  SPEAR_FIRE_COOLDOWN_MS,
} from "./rainbowCowboyConstants";
import type { RainbowCowboyEngine } from "./rainbowCowboyEngine";

/** Baked sprite atlas — one drawImage per frame at runtime (zero extra fillRect cost). */
const SPRITE_W = 104;
const SPRITE_H = 56;
const ORIGIN_X = 46;
const ORIGIN_Y = 28;

const SWIM_FRAMES = 4;
const SWIM_MS = 110;

const P = {
  suit: "#0a2238",
  suitMid: "#143858",
  suitHi: "#1a4870",
  suitEdge: "#061828",
  seam: "#0e3048",
  bcd: "#184868",
  bcdHi: "#206090",
  bcdPad: "#2878a8",
  gold: "#e8c030",
  goldSh: "#c8a820",
  goldHi: "#ffe850",
  rubber: "#1a2838",
  strap: "#1a2030",
  visor: "#1a2838",
  visorGl: "#48b8e8",
  visorHi: "#a8f0ff",
  tank: "#586068",
  tankHi: "#788898",
  tankBand: "#909aa8",
  tankBoot: "#404850",
  valve: "#a0a8b0",
  hose: "#303840",
  hoseHi: "#484850",
  glove: "#d8c8a8",
  gloveSh: "#b8a888",
  fin: "#081018",
  finBlade: "#0c1828",
  finEdge: "#141e28",
  finVent: "#182028",
  bootie: "#0c1828",
  belt: "#282830",
  buckle: "#a89050",
  weight: "#505058",
  dRing: "#909098",
  gauge: "#283038",
  gaugeFace: "#48c8e8",
  computer: "#202830",
  computerFace: "#58e8a0",
  knife: "#686868",
  knifeHilt: "#8a6840",
  spear: "#404850",
  spearHi: "#586868",
  spearGrip: "#2a3038",
  reel: "#505860",
  tip: "#ccddee",
  torch: "#ffe880",
  bubble: "rgba(170,230,255,0.45)",
  bubbleHi: "rgba(220,248,255,0.55)",
} as const;

/** rear fin, front fin, body wave, rear arm, front arm */
const SWIM_POSE: [number, number, number, number, number][] = [
  [0, 0, 0, 0, 0],
  [2, -2, 1, 1, -1],
  [1, 1, 0, 0, 0],
  [-1, 2, -1, -1, 1],
];

type FrameCache = HTMLCanvasElement[][];

let frameCache: FrameCache | null = null;

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

function drawHose(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  const pts: [number, number][] = [
    [-16, -9],
    [-12, -8],
    [-8, -7],
    [-4, -6],
    [0, -5],
    [4, -4],
  ];
  for (const [dx, dy] of pts) {
    px(ctx, ox + dx, oy + dy, 3, 3, P.hose);
  }
  px(ctx, ox - 13, oy - 8, 2, 2, P.hoseHi);
}

function drawInflatorHose(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  px(ctx, ox - 10, oy + 4, 2, 2, P.hose);
  px(ctx, ox - 7, oy + 5, 2, 2, P.hose);
  px(ctx, ox - 4, oy + 5, 2, 2, P.hose);
  px(ctx, ox - 2, oy + 4, 3, 2, P.hoseHi);
}

function drawTorchBeam(ctx: CanvasRenderingContext2D, bodyWave: number) {
  const y = bodyWave;
  const grad = ctx.createLinearGradient(28, 0, 96, 0);
  grad.addColorStop(0, "rgba(180,245,255,0.42)");
  grad.addColorStop(0.35, "rgba(120,210,240,0.18)");
  grad.addColorStop(0.7, "rgba(70,160,200,0.07)");
  grad.addColorStop(1, "rgba(40,100,140,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(24, -8 + y);
  ctx.lineTo(96, -16 + y);
  ctx.lineTo(96, 16 + y);
  ctx.lineTo(24, 8 + y);
  ctx.closePath();
  ctx.fill();

  // Dust motes in beam (baked static specks)
  ctx.fillStyle = "rgba(220,248,255,0.25)";
  px(ctx, 38, -2 + y, 2, 2, "rgba(220,248,255,0.25)");
  px(ctx, 52, 2 + y, 2, 2, "rgba(220,248,255,0.2)");
  px(ctx, 68, -4 + y, 2, 2, "rgba(220,248,255,0.15)");
  px(ctx, 80, 1 + y, 2, 2, "rgba(220,248,255,0.1)");
}

/** Rich diver art — only runs once per frame variant at cache bake time. */
function drawFrogmanBakedFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shooting: boolean,
) {
  const [rearFin, frontFin, bodyWave, rearArm, frontArm] = SWIM_POSE[frame % SWIM_FRAMES];
  const r = shooting ? -2 : 0;

  drawTorchBeam(ctx, bodyWave);

  // --- Rear fin assembly ---
  px(ctx, -34 + r, 9 + rearFin, 16, 3, P.fin);
  px(ctx, -38 + r, 6 + rearFin, 12, 10, P.finBlade);
  px(ctx, -36 + r, 5 + rearFin, 10, 2, P.finEdge);
  px(ctx, -32 + r, 8 + rearFin, 6, 2, P.finVent);
  px(ctx, -24 + r, 7 + rearFin, 12, 5, P.bootie);
  px(ctx, -22 + r, 8 + rearFin, 10, 4, P.suitMid);
  px(ctx, -20 + r, 9 + rearFin, 8, 2, P.seam);

  // --- Tank + boot + straps ---
  px(ctx, -24 + r, -14, 10, 18, P.tank);
  px(ctx, -22 + r, -12, 8, 14, P.tankHi);
  px(ctx, -23 + r, -9, 9, 2, P.tankBand);
  px(ctx, -23 + r, -4, 9, 2, P.tankBand);
  px(ctx, -23 + r, 1, 9, 2, P.tankBand);
  px(ctx, -22 + r, 3, 8, 3, P.tankBoot);
  px(ctx, -20 + r, -16, 6, 3, P.valve);
  px(ctx, -19 + r, -17, 4, 2, P.tankBand);
  px(ctx, -14 + r, -10, 3, 14, P.strap);
  px(ctx, -12 + r, -8, 2, 10, P.strap);

  // --- Torso / wetsuit panels ---
  px(ctx, -20 + r, -4 + bodyWave, 32, 14, P.suitEdge);
  px(ctx, -18 + r, -2 + bodyWave, 28, 12, P.suit);
  px(ctx, -16 + r, 0 + bodyWave, 24, 8, P.suitMid);
  px(ctx, -14 + r, 2 + bodyWave, 20, 4, P.suitHi);
  px(ctx, -16 + r, 10 + bodyWave, 26, 2, P.suitEdge);
  // Neoprene seams
  px(ctx, -10 + r, -1 + bodyWave, 1, 10, P.seam);
  px(ctx, 2 + r, 0 + bodyWave, 1, 8, P.seam);
  px(ctx, -14 + r, 5 + bodyWave, 22, 1, P.seam);

  // --- BCD vest + console ---
  px(ctx, -14 + r, -3 + bodyWave, 20, 10, P.bcd);
  px(ctx, -12 + r, -1 + bodyWave, 16, 6, P.bcdHi);
  px(ctx, -16 + r, -4 + bodyWave, 6, 4, P.bcdPad);
  px(ctx, 4 + r, -3 + bodyWave, 6, 4, P.bcdPad);
  px(ctx, -6 + r, 1 + bodyWave, 8, 5, P.gauge);
  px(ctx, -5 + r, 2 + bodyWave, 6, 3, P.gaugeFace);
  px(ctx, -2 + r, -4 + bodyWave, 4, 3, P.dRing);

  // --- Weight belt ---
  px(ctx, -16 + r, 9 + bodyWave, 24, 3, P.belt);
  px(ctx, -12 + r, 10 + bodyWave, 4, 2, P.weight);
  px(ctx, -4 + r, 10 + bodyWave, 4, 2, P.weight);
  px(ctx, -2 + r, 9 + bodyWave, 5, 3, P.buckle);

  // --- Front leg, bootie, fin ---
  px(ctx, -6 + r, 6 + frontFin, 10, 5, P.suitMid);
  px(ctx, 0 + r, 8 + frontFin, 8, 4, P.bootie);
  px(ctx, 2 + r, 10 + frontFin, 14, 3, P.fin);
  px(ctx, 4 + r, 7 + frontFin, 12, 10, P.finBlade);
  px(ctx, 6 + r, 6 + frontFin, 10, 2, P.finEdge);
  px(ctx, 8 + r, 9 + frontFin, 5, 2, P.finVent);

  // --- Thigh knife ---
  px(ctx, -2 + r, 7 + frontFin, 3, 6, P.knifeHilt);
  px(ctx, -1 + r, 11 + frontFin, 2, 5, P.knife);

  // --- Rear arm + wrist computer ---
  px(ctx, -26 + r, -1 + rearArm + bodyWave, 8, 5, P.suit);
  px(ctx, -28 + r, 1 + rearArm + bodyWave, 6, 6, P.gloveSh);
  px(ctx, -27 + r, 2 + rearArm + bodyWave, 5, 4, P.glove);
  px(ctx, -29 + r, 4 + rearArm + bodyWave, 5, 4, P.computer);
  px(ctx, -28 + r, 5 + rearArm + bodyWave, 3, 2, P.computerFace);

  // --- Spear gun (stock, reel, barrel, tip) ---
  px(ctx, 8 + r, 3 + bodyWave, 8, 6, P.spearGrip);
  px(ctx, 10 + r, 2 + bodyWave, 5, 4, P.reel);
  px(ctx, 14 + r, 1 + bodyWave, 28, 4, P.spear);
  px(ctx, 40 + r, 0 + bodyWave, 16, 4, P.spearHi);
  px(ctx, 54 + r, 1 + bodyWave, 10, 3, P.tip);
  px(ctx, 16 + r, 0 + bodyWave, 2, 2, P.suitEdge);
  px(ctx, 32 + r, 0 + bodyWave, 2, 2, P.suitEdge);

  // --- Trigger hand ---
  px(ctx, 4 + r, 4 + frontArm + bodyWave, 7, 6, P.gloveSh);
  px(ctx, 5 + r, 5 + frontArm + bodyWave, 6, 4, P.glove);

  // --- Gold full-face mask + skirt + torch mount ---
  px(ctx, 2 + r, -13 + bodyWave, 24, 14, P.goldSh);
  px(ctx, 4 + r, -11 + bodyWave, 20, 12, P.gold);
  px(ctx, 6 + r, -9 + bodyWave, 16, 9, P.goldHi);
  px(ctx, 7 + r, -8 + bodyWave, 14, 7, P.visor);
  px(ctx, 8 + r, -7 + bodyWave, 12, 5, P.visorGl);
  px(ctx, 9 + r, -6 + bodyWave, 8, 3, P.visorHi);
  px(ctx, 10 + r, -5 + bodyWave, 4, 1, "#fff");
  px(ctx, 5 + r, 1 + bodyWave, 18, 3, P.rubber);
  px(ctx, 24 + r, -5 + bodyWave, 4, 4, P.torch);
  px(ctx, 25 + r, -4 + bodyWave, 2, 2, "#fff");
  // Straps
  px(ctx, 3 + r, -1 + bodyWave, 3, 2, P.strap);
  px(ctx, 24 + r, -1 + bodyWave, 3, 2, P.strap);
  px(ctx, 5 + r, -13 + bodyWave, 5, 2, P.strap);
  px(ctx, 20 + r, -13 + bodyWave, 5, 2, P.strap);

  drawHose(ctx, 6 + r, -3 + bodyWave);
  drawInflatorHose(ctx, -8 + r, 2 + bodyWave);

  if (shooting) {
    px(ctx, 62 + r, 0 + bodyWave, 6, 5, P.visorHi);
    px(ctx, 64 + r, 1 + bodyWave, 5, 3, "#fff");
    px(ctx, 66 + r, 1 + bodyWave, 3, 2, "#fff");
    px(ctx, 6 + r, 3 + bodyWave, 6, 5, P.glove);
  }
}

function ensureFrameCache(): FrameCache | null {
  if (frameCache) return frameCache;
  if (typeof document === "undefined") return null;

  const cache: FrameCache = [];
  for (let f = 0; f < SWIM_FRAMES; f++) {
    cache[f] = [];
    for (let s = 0; s < 2; s++) {
      const canvas = document.createElement("canvas");
      canvas.width = SPRITE_W;
      canvas.height = SPRITE_H;
      const bctx = canvas.getContext("2d");
      if (!bctx) continue;
      bctx.translate(ORIGIN_X, ORIGIN_Y);
      drawFrogmanBakedFrame(bctx, f, s === 1);
      cache[f][s] = canvas;
    }
  }
  frameCache = cache;
  return frameCache;
}

function drawBubbles(ctx: CanvasRenderingContext2D, time: number, ox: number) {
  for (let i = 0; i < 3; i++) {
    const drift = (time / 45 + i * 11) % 20;
    const bx = ox - 6 - i * 10 - drift;
    const by = -6 - i * 6 + Math.sin(time / 120 + i) * 1.5;
    const sz = i === 0 ? 4 : 3;
    ctx.fillStyle = i === 0 ? P.bubbleHi : P.bubble;
    ctx.fillRect(Math.floor(bx), Math.floor(by), sz, sz);
  }
}

export function drawFrogman(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
  time: number,
) {
  const cx = engine.playerX - camX;
  const cy = engine.playerY - PLAYER_H * 0.55;
  const flip = engine.facing === "left" ? -1 : 1;
  const shooting =
    engine.lastGunWeapon === "spear" &&
    engine.timeMs - engine.lastGunFireMs < SPEAR_FIRE_COOLDOWN_MS * 0.5;
  const frame = Math.floor(time / SWIM_MS) % SWIM_FRAMES;
  const swimBob = Math.sin(time / 190) * 1.2;
  const pitch = Math.max(-0.14, Math.min(0.14, engine.playerVy * 0.012));
  const cache = ensureFrameCache();
  const shootingIdx = shooting ? 1 : 0;

  ctx.save();
  ctx.translate(cx, cy + swimBob);
  ctx.scale(flip, 1);
  ctx.rotate(pitch);

  drawBubbles(ctx, time, -32);

  if (cache?.[frame]?.[shootingIdx]) {
    ctx.drawImage(cache[frame][shootingIdx], -ORIGIN_X, -ORIGIN_Y);
  } else {
    ctx.translate(ORIGIN_X, ORIGIN_Y);
    drawFrogmanBakedFrame(ctx, frame, shooting);
    ctx.translate(-ORIGIN_X, -ORIGIN_Y);
  }

  if (engine.timeMs < engine.hitFlashUntil) {
    ctx.globalAlpha = 0.45 + Math.sin(time / 35) * 0.25;
    px(ctx, -ORIGIN_X, -ORIGIN_Y, SPRITE_W, SPRITE_H, "#fff");
    ctx.globalAlpha = 1;
  }

  if (engine.isRampage) {
    const hues = ["#f0f", "#ff0", "#0ff", "#f80"];
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.3;
      px(ctx, -36 - i * 5, -2 + i, 4, 4, hues[i]);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();
}

export function drawFrogmanSpearMuzzleFlash(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
) {
  if (engine.lastGunWeapon !== "spear") return;
  if (engine.timeMs - engine.lastGunFireMs > 80) return;
  const flip = engine.facing === "right" ? 1 : -1;
  const bob = Math.sin(engine.timeMs / 190) * 1.2;
  const sx = engine.playerX - camX + flip * 48;
  const sy = engine.playerY - PLAYER_H * 0.55 + bob;
  px(ctx, sx, sy - 2, 6, 6, P.visorHi);
  px(ctx, sx + flip * 5, sy - 1, 4, 4, "#fff");
}

export function drawFrogmanSonicFlash(
  ctx: CanvasRenderingContext2D,
  engine: RainbowCowboyEngine,
  camX: number,
) {
  if (engine.lastGunWeapon !== "sonic") return;
  if (engine.timeMs - engine.lastGunFireMs > 120) return;
  const flip = engine.facing === "right" ? 1 : -1;
  const bob = Math.sin(engine.timeMs / 190) * 1.2;
  const sx = engine.playerX - camX + flip * 34;
  const sy = engine.playerY - PLAYER_H * 0.55 + bob;
  px(ctx, sx - 4, sy - 6, 12, 12, "rgba(100,230,255,0.5)");
  px(ctx, sx, sy - 3, 6, 6, "#a8f8ff");
}
