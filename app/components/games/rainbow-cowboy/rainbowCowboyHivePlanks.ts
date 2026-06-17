import type { LevelPlatform } from "./rainbowCowboyTypes";

export type HivePlankKind = "slide" | "bob" | "collapse";

export type HivePlank = {
  id: number;
  kind: HivePlankKind;
  x: number;
  y: number;
  w: number;
  h: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  phase: number;
  collapsed: boolean;
  collapseMs: number;
  collapseTimerMs: number;
  active: boolean;
};

let plankId = 0;

function nextPlankId() {
  plankId += 1;
  return plankId;
}

const PLANK_COUNT = 4;
const PLANK_W = 120;
const PLANK_H = 14;
const PLANK_HEIGHTS = [110, 178, 248, 142];

export function createHivePlanks(
  arenaStartX: number,
  arenaWidth: number,
  groundY: number,
): HivePlank[] {
  const pad = 80;
  const span = arenaWidth - pad * 2;
  const segment = span / PLANK_COUNT;

  return PLANK_HEIGHTS.map((lift, index) => {
    const x = arenaStartX + pad + index * segment + (segment - PLANK_W) / 2;
    const y = groundY - lift;
    return {
      id: nextPlankId(),
      kind: "slide" as const,
      x,
      y,
      w: PLANK_W,
      h: PLANK_H,
      baseX: x,
      baseY: y,
      vx: 0,
      vy: 0,
      phase: 0,
      collapsed: false,
      collapseMs: 0,
      collapseTimerMs: 0,
      active: true,
    };
  });
}

export function tickHivePlanks(
  _planks: HivePlank[],
  _dtMs: number,
  _arenaStartX: number,
  _arenaEndX: number,
  _phase: number,
) {
  // Planks are static for this encounter.
}

export function hivePlankPlatforms(planks: HivePlank[]): LevelPlatform[] {
  const out: LevelPlatform[] = [];
  for (const plank of planks) {
    if (!plank.active || plank.collapsed) continue;
    out.push({ x: plank.x, y: plank.y, w: plank.w, h: plank.h });
  }
  return out;
}
