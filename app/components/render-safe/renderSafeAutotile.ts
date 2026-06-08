import { TILE_SIZE, getTile, type RenderSafeTile } from "./renderSafeMap";

export type PlayerFacing = "up" | "down" | "left" | "right";

export function isPathLike(tile: RenderSafeTile): boolean {
  return tile === "path" || tile === "start" || tile === "bridge" || tile === "target";
}

export function isWallLike(tile: RenderSafeTile): boolean {
  return tile === "wall";
}

function tileAt(col: number, row: number): RenderSafeTile {
  return getTile(col, row);
}

/** 4-bit mask: N=1, E=2, S=4, W=8 */
export function pathNeighborMask(col: number, row: number): number {
  let mask = 0;
  if (isPathLike(tileAt(col, row - 1))) mask |= 1;
  if (isPathLike(tileAt(col + 1, row))) mask |= 2;
  if (isPathLike(tileAt(col, row + 1))) mask |= 4;
  if (isPathLike(tileAt(col - 1, row))) mask |= 8;
  return mask;
}

export function wallNeighborMask(col: number, row: number): number {
  let mask = 0;
  if (isWallLike(tileAt(col, row - 1))) mask |= 1;
  if (isWallLike(tileAt(col + 1, row))) mask |= 2;
  if (isWallLike(tileAt(col, row + 1))) mask |= 4;
  if (isWallLike(tileAt(col - 1, row))) mask |= 8;
  return mask;
}

/** Grass/brush fringe + inner corner cuts on trail tiles. */
export function drawPathAutotileOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
) {
  const mask = pathNeighborMask(col, row);
  const fringe = "#1e3220";
  const fringeHi = "#2a4228";

  const drawFringe = (side: "n" | "s" | "e" | "w", depth: number) => {
    ctx.fillStyle = fringe;
    if (side === "n") ctx.fillRect(x, y, TILE_SIZE, depth);
    if (side === "s") ctx.fillRect(x, y + TILE_SIZE - depth, TILE_SIZE, depth);
    if (side === "w") ctx.fillRect(x, y, depth, TILE_SIZE);
    if (side === "e") ctx.fillRect(x + TILE_SIZE - depth, y, depth, TILE_SIZE);
    ctx.fillStyle = fringeHi;
    if (side === "n") ctx.fillRect(x, y, TILE_SIZE, 2);
    if (side === "s") ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
    if (side === "w") ctx.fillRect(x, y, 2, TILE_SIZE);
    if (side === "e") ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE);
  };

  if (!(mask & 1)) drawFringe("n", 5);
  if (!(mask & 4)) drawFringe("s", 5);
  if (!(mask & 8)) drawFringe("w", 4);
  if (!(mask & 2)) drawFringe("e", 4);

  const diag = (dc: number, dr: number) => tileAt(col + dc, row + dr);
  const inner = (hasA: boolean, hasB: boolean, dcol: number, drow: number, px: number, py: number) => {
    if (hasA && hasB && !isPathLike(diag(dcol, drow))) {
      ctx.fillStyle = fringe;
      ctx.fillRect(x + px, y + py, 5, 5);
    }
  };

  inner(!!(mask & 1), !!(mask & 8), -1, -1, 0, 0);
  inner(!!(mask & 1), !!(mask & 2), 1, -1, TILE_SIZE - 5, 0);
  inner(!!(mask & 4), !!(mask & 8), -1, 1, 0, TILE_SIZE - 5);
  inner(!!(mask & 4), !!(mask & 2), 1, 1, TILE_SIZE - 5, TILE_SIZE - 5);

  if (mask === 0) {
    ctx.fillStyle = fringe;
    ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    ctx.fillStyle = "#5a5038";
    ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
  }
}

/** Cliff-style wall caps and pillar corners. */
export function drawWallAutotileOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
) {
  const mask = wallNeighborMask(col, row);
  const openN = !(mask & 1);
  const openS = !(mask & 4);
  const openW = !(mask & 8);
  const openE = !(mask & 2);

  if (openN) {
    ctx.fillStyle = "#565656";
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 5);
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, 1);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x + 1, y + 5, TILE_SIZE - 2, 2);
  }

  if (openS) {
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 2, y + TILE_SIZE - 5, TILE_SIZE - 4, 4);
  }

  if (openW) {
    ctx.fillStyle = "#333";
    ctx.fillRect(x, y + 2, 3, TILE_SIZE - 4);
  }

  if (openE) {
    ctx.fillStyle = "#484848";
    ctx.fillRect(x + TILE_SIZE - 3, y + 2, 3, TILE_SIZE - 4);
  }

  if (openN && openW) {
    ctx.fillStyle = "#626262";
    ctx.fillRect(x, y, 6, 6);
  }
  if (openN && openE) {
    ctx.fillStyle = "#626262";
    ctx.fillRect(x + TILE_SIZE - 6, y, 6, 6);
  }
}

export function drawStartMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
) {
  const pulse = 0.6 + Math.sin(time / 400) * 0.25;
  ctx.strokeStyle = `rgba(34,197,94,${pulse})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);

  ctx.fillStyle = `rgba(34,197,94,${pulse * 0.15})`;
  ctx.fillRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10);

  ctx.fillStyle = "#22c55e";
  ctx.fillRect(x + TILE_SIZE / 2 - 1, y + 6, 2, TILE_SIZE - 12);
  ctx.fillRect(x + 6, y + TILE_SIZE / 2 - 1, TILE_SIZE - 12, 2);
}
