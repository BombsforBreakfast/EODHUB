import type { RenderSafeEncounter } from "./renderSafeTypes";

export type RenderSafeTile =
  | "grass"
  | "brush"
  | "path"
  | "wall"
  | "rock"
  | "water"
  | "bridge"
  | "target"
  | "start";

export type RouteTile = { col: number; row: number };

export const MAP_COLS = 26;
export const MAP_ROWS = 80;
export const TILE_SIZE = 20;
export const VIEWPORT_TILE_ROWS = 17;

const CHAR_MAP: Record<string, RenderSafeTile> = {
  g: "grass",
  b: "brush",
  p: "path",
  w: "wall",
  k: "rock",
  o: "water",
  x: "bridge",
  t: "target",
  s: "start",
};

/** Northern cap: target, bridge, upper pinches (rows 0–19). */
const NORTH_CAP: string[] = [
  "ggggggggttttttgggggggggggg",
  "gggggggtttttttgggggggggggg",
  "gggggwwttttttwwggggggggggg",
  "gggggwwppppppwwggggggggggg",
  "ggbboooopxxxppppooobbbgggg",
  "ggbboooooxxxppppoooobbgggg",
  "gggwwwwwppppppwwwwwggggggg",
  "ggggwwppppppppwwgggggggggg",
  "gggggpppwpppppppgggggggggg",
  "ggggppwwwwppppppgggggggggg",
  "gggpppwwwwpppppppggggggggg",
  "gggppppwppppppwpppgggggggg",
  "gggpppppppppppppppgggggggg",
  "ggppppbbppppppbbpppggggggg",
  "ggppppbbppppppbbpppggggggg",
  "ggppwppppppppppwpppggggggg",
  "ggppwppppppppppwpppggggggg",
  "gggpppppppppppppppgggggggg",
  "gggwppppppppppppwggggggggg",
  "gggpppppppppppppppgggggggg",
];

/** Southern cap: start zone (rows 76–79). */
const SOUTH_CAP: string[] = [
  "gggggggggpppppppppgggggggg",
  "ggggggggggppppppppgggggggg",
  "gggggggsppppppppsggggggggg",
  "gggggggggggggggggggggggggg",
];

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintPathLine(chars: string[], center: number, halfWidth: number) {
  for (let c = Math.max(0, center - halfWidth); c <= Math.min(25, center + halfWidth); c++) {
    if (chars[c] === "g" || chars[c] === "b") chars[c] = "p";
  }
}

function paintBrushEdges(chars: string[]) {
  for (let c = 0; c < 26; c++) {
    if (chars[c] === "g" && (c <= 2 || c >= 23)) chars[c] = "b";
  }
}

/** Narrow the lane visually with off-trail berms — never overwrite path tiles. */
function paintPathBerms(chars: string[], center: number, halfWidth: number) {
  for (const offset of [-(halfWidth + 1), halfWidth + 1]) {
    const c = center + offset;
    if (c >= 0 && c < 26 && chars[c] !== "p") chars[c] = "b";
  }
  for (const offset of [-(halfWidth + 2), halfWidth + 2]) {
    const c = center + offset;
    if (c >= 0 && c < 26 && chars[c] !== "p" && chars[c] !== "b") chars[c] = "w";
  }
}

function parseRows(rows: string[]): RenderSafeTile[][] {
  return rows.map((row) => row.split("").map((ch) => CHAR_MAP[ch] ?? "grass"));
}

/** Seeded winding mid-section (rows 20–75). Same seed = same path. */
function generateMidSection(seed: number): string[] {
  const rand = mulberry32(seed);
  const rows: string[] = [];
  let center = 10 + Math.floor(rand() * 5);
  const count = 56;

  for (let i = 0; i < count; i++) {
    const chars = Array(26).fill("g");
    const drift =
      Math.round(Math.sin(i * 0.42 + seed * 0.001) * 2) +
      Math.round(Math.cos(i * 0.17 + seed * 0.002) * 1) +
      (rand() > 0.62 ? 1 : 0) -
      (rand() > 0.72 ? 1 : 0);
    center = Math.max(7, Math.min(18, center + drift));

    const roll = rand();
    const width = roll > 0.82 ? 1 : roll > 0.5 ? 2 : 3;
    paintPathLine(chars, center, width);

    if (rand() > 0.68 && i % 5 === 2) paintPathBerms(chars, center, width);

    paintBrushEdges(chars);
    rows.push(chars.join(""));
  }

  return rows;
}

function stitchLevelRows(seed: number): string[] {
  const mid = generateMidSection(seed);
  const rows = [...NORTH_CAP, ...mid, ...SOUTH_CAP];
  if (rows.length !== MAP_ROWS) {
    throw new Error(`Level 1 map row count mismatch: ${rows.length} !== ${MAP_ROWS}`);
  }
  return rows;
}

let activeTiles: RenderSafeTile[][] = [];
let activeRoute: RouteTile[] = [];
let encounterPlacements: Record<string, RouteTile> = {};
let activeRockSpots: Array<[number, number]> = [];
let activeMapSeed = 1;

export const LEVEL_1_TILES: RenderSafeTile[][] = activeTiles;

const WALKABLE = new Set<RenderSafeTile>(["path", "bridge", "start", "target"]);

export function isWalkableTile(tile: RenderSafeTile): boolean {
  return WALKABLE.has(tile);
}

export function getMapSeed(): number {
  return activeMapSeed;
}

export function getMainRoute(): RouteTile[] {
  return activeRoute;
}

export function getRockSpots(): Array<[number, number]> {
  return activeRockSpots;
}

function findStartTile(tiles: RenderSafeTile[][]): RouteTile | null {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (tiles[row][col] === "start") return { col, row };
    }
  }
  return null;
}

function isRockSpot(col: number, row: number, rockSpots: Array<[number, number]>): boolean {
  return rockSpots.some(([rockCol, rockRow]) => rockCol === col && rockRow === row);
}

/** BFS on walkable tiles — ensures start can reach the target building. */
function validateWalkableConnectivity(
  tiles: RenderSafeTile[][],
  rockSpots: Array<[number, number]> = [],
): boolean {
  const start = findStartTile(tiles);
  if (!start) return false;

  const visited = new Set<string>();
  const queue: RouteTile[] = [start];
  visited.add(`${start.col},${start.row}`);
  let reachedTarget = false;

  while (queue.length > 0) {
    const { col, row } = queue.shift()!;
    const tile = tiles[row][col];
    if (tile === "target") reachedTarget = true;

    for (const [dc, dr] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const nc = col + dc;
      const nr = row + dr;
      if (nr < 0 || nr >= MAP_ROWS || nc < 0 || nc >= MAP_COLS) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (isRockSpot(nc, nr, rockSpots)) continue;
      if (!isWalkableTile(tiles[nr][nc])) continue;
      visited.add(key);
      queue.push({ col: nc, row: nr });
    }
  }

  return reachedTarget;
}

function generateRockSpots(tiles: RenderSafeTile[][], route: RouteTile[], seed: number): Array<[number, number]> {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const blocked = new Set<string>();

  for (const p of route) {
    blocked.add(`${p.col},${p.row}`);
  }

  const spots: Array<[number, number]> = [];
  for (let attempt = 0; attempt < 120 && spots.length < 8; attempt++) {
    const routeTile = route[Math.floor(rand() * route.length)];
    const side = rand() > 0.5 ? 1 : -1;
    const offset = rand() > 0.45 ? 2 : 3;
    const col = routeTile.col + side * offset;
    const row = routeTile.row + Math.floor(rand() * 3) - 1;
    if (row < 18 || row >= MAP_ROWS - 2 || col <= 0 || col >= MAP_COLS - 1) continue;
    if (blocked.has(`${col},${row}`)) continue;
    if (tiles[row][col] !== "grass") continue;
    if (spots.some(([c, r]) => Math.abs(c - col) + Math.abs(r - row) < 4)) continue;
    spots.push([col, row]);
  }

  for (let attempt = 0; attempt < 100 && spots.length < 14; attempt++) {
    const col = 1 + Math.floor(rand() * (MAP_COLS - 2));
    const row = 18 + Math.floor(rand() * 58);
    if (blocked.has(`${col},${row}`)) continue;
    if (tiles[row][col] !== "grass") continue;
    if (spots.some(([c, r]) => Math.abs(c - col) + Math.abs(r - row) < 5)) continue;
    spots.push([col, row]);
  }

  return spots;
}

function loadMapFromSeed(seed: number): void {
  activeMapSeed = seed >>> 0;
  activeTiles = parseRows(stitchLevelRows(activeMapSeed));
  activeRoute = buildMainRoute(activeTiles);
  activeRockSpots = generateRockSpots(activeTiles, activeRoute, activeMapSeed);
}

export function initRenderSafeMap(seed: number): RenderSafeTile[][] {
  loadMapFromSeed(seed);
  return activeTiles;
}

export function buildMainRoute(tiles: RenderSafeTile[][] = activeTiles): RouteTile[] {
  let startRow = -1;
  let startCol = 12;

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (tiles[row][col] === "start") {
        startRow = row;
        startCol = col;
      }
    }
  }

  if (startRow < 0) {
    startRow = MAP_ROWS - 4;
  }

  const route: RouteTile[] = [{ col: startCol, row: startRow }];
  let lastCol = startCol;

  for (let row = startRow - 1; row >= 0; row--) {
    const walkableCols: number[] = [];
    for (let col = 0; col < MAP_COLS; col++) {
      if (isWalkableTile(tiles[row][col])) walkableCols.push(col);
    }
    if (walkableCols.length === 0) continue;

    let bestCol = walkableCols[0];
    let bestScore = Infinity;
    for (const col of walkableCols) {
      const horizontal = Math.abs(col - lastCol);
      const prevTile = tiles[row + 1]?.[col];
      const bridgeBonus = tiles[row][col] === "bridge" || prevTile === "bridge" ? -0.5 : 0;
      const score = horizontal + bridgeBonus;
      if (score < bestScore) {
        bestScore = score;
        bestCol = col;
      }
    }

    route.push({ col: bestCol, row });
    lastCol = bestCol;
  }

  return route;
}

export function lanePositionToRouteIndex(lanePosition: number, route: RouteTile[]): number {
  const t = Math.max(0, Math.min(1, lanePosition / 100));
  return Math.max(0, Math.min(route.length - 1, Math.round(t * (route.length - 1))));
}

function findBridgeRouteTile(route: RouteTile[]): RouteTile | null {
  const bridgeTiles = route.filter((p) => activeTiles[p.row][p.col] === "bridge");
  return bridgeTiles[Math.floor(bridgeTiles.length / 2)] ?? bridgeTiles[0] ?? null;
}

function findTargetRouteTile(route: RouteTile[]): RouteTile {
  for (const p of route) {
    if (activeTiles[p.row][p.col] === "target") return p;
  }
  return route[route.length - 1] ?? { col: 12, row: 1 };
}

export function placeEncountersOnRoute(
  encounters: RenderSafeEncounter[],
  route: RouteTile[] = activeRoute,
): Record<string, RouteTile> {
  const placements: Record<string, RouteTile> = {};
  const usedIndices = new Set<number>();

  for (const enc of encounters) {
    if (enc.type === "target_building") {
      placements[enc.id] = findTargetRouteTile(route);
      continue;
    }

    if (enc.type === "bridge_crossing") {
      const bridge = findBridgeRouteTile(route);
      if (bridge) {
        placements[enc.id] = bridge;
        const bridgeIdx = route.findIndex((p) => p.col === bridge.col && p.row === bridge.row);
        if (bridgeIdx >= 0) usedIndices.add(bridgeIdx);
      } else {
        let idx = lanePositionToRouteIndex(enc.lanePosition, route);
        while (usedIndices.has(idx) && idx < route.length - 1) idx++;
        usedIndices.add(idx);
        placements[enc.id] = route[idx];
      }
      continue;
    }

    let idx = lanePositionToRouteIndex(enc.lanePosition, route);
    while (usedIndices.has(idx) && idx < route.length - 1) idx++;
    usedIndices.add(idx);
    placements[enc.id] = route[idx];
  }

  return placements;
}

/** Randomize map path + snap all route encounters onto the walkable lane. */
export function prepareRenderSafeLevelRun(
  encounters: RenderSafeEncounter[],
  seed = Math.floor(Math.random() * 0xffffffff),
): number {
  let attemptSeed = seed >>> 0;

  for (let attempt = 0; attempt < 24; attempt++) {
    loadMapFromSeed(attemptSeed);
    if (validateWalkableConnectivity(activeTiles, activeRockSpots)) {
      encounterPlacements = placeEncountersOnRoute(encounters, activeRoute);
      return attemptSeed;
    }
    attemptSeed = (attemptSeed * 1664525 + 1013904223) >>> 0;
  }

  loadMapFromSeed(1);
  encounterPlacements = placeEncountersOnRoute(encounters, activeRoute);
  return 1;
}

export function playerRouteIndex(px: number, py: number, route: RouteTile[] = activeRoute): number {
  if (route.length === 0) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length; i++) {
    const center = tileCenterPx(route[i].col, route[i].row);
    const dist = Math.hypot(px - center.x, py - center.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function encounterRouteIndex(
  encounter: RenderSafeEncounter,
  route: RouteTile[] = activeRoute,
): number {
  const tile = encounterToTile(encounter);
  let bestIdx = lanePositionToRouteIndex(encounter.lanePosition, route);
  let bestDist = Infinity;

  for (let i = 0; i < route.length; i++) {
    if (route[i].col === tile.col && route[i].row === tile.row) {
      return i;
    }
    const center = tileCenterPx(route[i].col, route[i].row);
    const encCenter = tileCenterPx(tile.col, tile.row);
    const dist = Math.hypot(center.x - encCenter.x, center.y - encCenter.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function getTile(col: number, row: number): RenderSafeTile {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return "wall";
  if (activeRockSpots.some(([rockCol, rockRow]) => rockCol === col && rockRow === row)) return "rock";
  return activeTiles[row][col];
}

export function tileCenterPx(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function pixelToTile(px: number, py: number): { col: number; row: number } {
  return {
    col: Math.floor(px / TILE_SIZE),
    row: Math.floor(py / TILE_SIZE),
  };
}

export function findStartPosition(): { x: number; y: number } {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (activeTiles[row][col] === "start") {
        return tileCenterPx(col, row);
      }
    }
  }
  return tileCenterPx(12, 77);
}

export function findTargetCenter(): { x: number; y: number; col: number; row: number } {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      if (activeTiles[row][col] === "target") {
        const c = tileCenterPx(col, row);
        return { ...c, col, row };
      }
    }
  }
  return { ...tileCenterPx(12, 1), col: 12, row: 1 };
}

export function canMoveTo(px: number, py: number, radius = 6): boolean {
  const points = [
    { x: px - radius, y: py - radius },
    { x: px + radius, y: py - radius },
    { x: px - radius, y: py + radius },
    { x: px + radius, y: py + radius },
  ];
  return points.every(({ x, y }) => {
    const { col, row } = pixelToTile(x, y);
    return isWalkableTile(getTile(col, row));
  });
}

export function encounterToTile(encounter: RenderSafeEncounter): { col: number; row: number } {
  if (encounterPlacements[encounter.id]) {
    return encounterPlacements[encounter.id];
  }

  if (encounter.mapCol != null && encounter.mapRow != null) {
    return { col: encounter.mapCol, row: encounter.mapRow };
  }

  const row = Math.round((1 - encounter.lanePosition / 100) * (MAP_ROWS - 2)) + 1;
  const col = Math.round((encounter.x / 100) * (MAP_COLS - 1));
  return { col, row };
}

export function encounterProgress(encounter: RenderSafeEncounter): number {
  const { row } = encounterToTile(encounter);
  return Math.round(((MAP_ROWS - 1 - row) / (MAP_ROWS - 1)) * 100);
}

export function playerProgress(py: number): number {
  const row = py / TILE_SIZE;
  return Math.min(100, Math.max(0, Math.round(((MAP_ROWS - 1 - row) / (MAP_ROWS - 1)) * 100)));
}

export function distancePx(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;
export const VIEWPORT_HEIGHT = VIEWPORT_TILE_ROWS * TILE_SIZE;

export function computeCameraY(playerY: number, viewportHeight = VIEWPORT_HEIGHT): number {
  const half = viewportHeight / 2;
  let cam = playerY - half;
  cam = Math.max(0, cam);
  cam = Math.min(MAP_HEIGHT - viewportHeight, cam);
  return Math.floor(cam);
}

export const TILE_COLORS: Record<RenderSafeTile, string> = {
  grass: "#243824",
  brush: "#1a3018",
  path: "#4a3f2e",
  wall: "#353535",
  rock: "#4a4a4a",
  water: "#142840",
  bridge: "#5c4c3a",
  target: "#32323c",
  start: "#4a3f2e",
};

export const TILE_ACCENT: Partial<Record<RenderSafeTile, string>> = {
  grass: "#2e4a2e",
  brush: "#224422",
  path: "#5a4d38",
  water: "#1c3454",
  bridge: "#6e5e48",
  target: "#42424e",
};

export const PLAYER_BODY_COLOR = "#4b5320";
export const PLAYER_ACCENT_COLOR = "#6b7040";

loadMapFromSeed(1);
