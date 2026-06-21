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

/* ─── Laser gator atlas (4 tail frames, facing right on surface) ─── */

export const GATOR_SPRITE_W = 88;
export const GATOR_SPRITE_H = 44;
export const GATOR_ORIGIN_X = 44;
export const GATOR_ORIGIN_Y = 22;
export const GATOR_FRAMES = 4;

const GATOR = {
  body: "#2a6848",
  bodyMid: "#348858",
  bodyHi: "#409868",
  bodyEdge: "#1a4030",
  belly: "#4a9870",
  bellyHi: "#58a880",
  scale: "#226040",
  leg: "#1e5038",
  legHi: "#286848",
  eye: "#ff2020",
  eyeHi: "#ff6060",
  teeth: "#e8f0e8",
  mouth: "#1a3028",
} as const;

const GATOR_POSE: [number, number][] = [
  [0, 0],
  [3, 1],
  [0, 2],
  [-3, 1],
];

export function drawGatorBakedFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const [tailWag, legWave] = GATOR_POSE[frame % GATOR_FRAMES];

  // Tail
  px(ctx, -40 + tailWag, -4, 14, 8, GATOR.bodyEdge);
  px(ctx, -44 + tailWag * 1.2, 0, 10, 6, GATOR.body);
  px(ctx, -38 + tailWag, 4, 12, 6, GATOR.bodyMid);

  // Torso
  px(ctx, -30, -10, 54, 20, GATOR.bodyEdge);
  px(ctx, -28, -8, 50, 16, GATOR.body);
  px(ctx, -24, -6, 42, 12, GATOR.bodyMid);
  px(ctx, -18, -2, 32, 8, GATOR.belly);
  px(ctx, -12, 0, 22, 5, GATOR.bellyHi);
  px(ctx, -6, -5, 8, 3, GATOR.scale);
  px(ctx, 4, 3, 10, 2, GATOR.scale);

  // Back ridges
  for (let r = 0; r < 5; r++) {
    px(ctx, -16 + r * 8, -12 + (r % 2), 4, 4, GATOR.bodyEdge);
  }

  // Head + snout
  px(ctx, 22, -8, 16, 16, GATOR.body);
  px(ctx, 28, -6, 14, 12, GATOR.bodyMid);
  px(ctx, 34, -4, 10, 8, GATOR.bodyHi);
  px(ctx, 38, -2, 8, 6, GATOR.bodyMid);
  px(ctx, 30, 2, 14, 3, GATOR.bodyEdge);
  px(ctx, 32, 3, 4, 1, GATOR.teeth);
  px(ctx, 36, 3, 4, 1, GATOR.teeth);
  px(ctx, 40, 3, 3, 1, GATOR.teeth);

  // Eye
  px(ctx, 26, -5, 6, 5, "#0a2018");
  px(ctx, 27, -4, 4, 3, GATOR.eye);
  px(ctx, 28, -4, 2, 2, GATOR.eyeHi);

  // Legs (tucked for surface float)
  px(ctx, -8, 8 + legWave, 8, 6, GATOR.leg);
  px(ctx, -6, 10 + legWave, 5, 4, GATOR.legHi);
  px(ctx, 6, 8 - legWave * 0.5, 8, 6, GATOR.leg);
  px(ctx, 8, 10 - legWave * 0.5, 5, 4, GATOR.legHi);
  px(ctx, 18, 7 + legWave * 0.3, 7, 5, GATOR.leg);

  // Open jaw (kamikaze dive — drawn at runtime when swooping)
}

let gatorFrameCache: HTMLCanvasElement[] | null = null;

export function ensureGatorFrameCache(): HTMLCanvasElement[] | null {
  if (gatorFrameCache) return gatorFrameCache;
  if (typeof document === "undefined") return null;

  gatorFrameCache = [];
  for (let f = 0; f < GATOR_FRAMES; f++) {
    const canvas = document.createElement("canvas");
    canvas.width = GATOR_SPRITE_W;
    canvas.height = GATOR_SPRITE_H;
    const bctx = canvas.getContext("2d");
    if (!bctx) continue;
    bctx.translate(GATOR_ORIGIN_X, GATOR_ORIGIN_Y);
    drawGatorBakedFrame(bctx, f);
    gatorFrameCache[f] = canvas;
  }
  return gatorFrameCache;
}
