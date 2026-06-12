import { LEVEL_2_CONFIG, LEVEL_2_META } from "./rainbowCowboyLevel2";
import { LEVEL_3_CONFIG, LEVEL_3_META } from "./rainbowCowboyLevel3";
import { LEVEL_5_CONFIG, LEVEL_5_META } from "./rainbowCowboyLevel5";
import { applyDifficulty } from "./rainbowCowboyDifficulty";
import type { RainbowCowboyDifficulty } from "./rainbowCowboyTypes";
import type { LevelConfig, RainbowCowboyLevel } from "./rainbowCowboyTypes";
const GROUND_Y = 460;
const LEVEL_WIDTH = 9600;

export const LEVEL_1_META: RainbowCowboyLevel = {
  id: "level-1",
  slug: "pasture-of-peril",
  title: "Pasture of Peril",
  subtitle: "Ride to extraction, eat drones, avoid hazards, and survive the chaos.",
  objective: "Reach the extraction point alive.",
  description:
    "A ridiculous pasture full of cartoon drones, trash balloons, and poor life choices. Side-scroll to glory.",
  difficulty: "Recruit",
  estimatedMinutes: "2–4 minutes",
  levelWidth: LEVEL_WIDTH,
  groundY: GROUND_Y,
  targetTimeSeconds: 150,
  status: "playable",
};

const LOCKED_LEVELS: RainbowCowboyLevel[] = [
  {
    id: "level-4",
    slug: "chemical-carnival",
    title: "Chemical Carnival",
    subtitle: "Coming Soon",
    objective: "",
    description: "",
    difficulty: "—",
    estimatedMinutes: "TBD",
    levelWidth: 0,
    groundY: 0,
    targetTimeSeconds: 0,
    locked: true,
    status: "coming_soon",
  },
];

export const LEVEL_1_CONFIG: LevelConfig = {
  level: LEVEL_1_META,
  platforms: [
    // Section 2 ledge
    { x: 1650, y: 360, w: 140, h: 16 },
    // Section 3 ledge after mines
    { x: 3100, y: 340, w: 120, h: 16 },
    // Section 5 ledges in dynamite field
    { x: 5100, y: 350, w: 100, h: 16 },
    { x: 5450, y: 300, w: 120, h: 16 },
    { x: 5800, y: 360, w: 90, h: 16 },
    // Section 7 final stretch
    { x: 8500, y: 370, w: 160, h: 16 },
  ],
  walls: [
    // Section 1 low wall
    { x: 520, y: GROUND_Y - 64, w: 32, h: 64 },
    // Section 5 jump walls
    { x: 4950, y: GROUND_Y - 80, w: 32, h: 80 },
    { x: 5650, y: GROUND_Y - 72, w: 32, h: 72 },
    // Section 7 barrier
    { x: 8100, y: GROUND_Y - 96, w: 32, h: 96 },
  ],
  pickups: [
    // Section 1
    { kind: "range_beer", x: 350, y: GROUND_Y - 36 },
    // Section 2 rainbow on ledge
    { kind: "rainbow", x: 1700, y: 330 },
    // Section 3 white energy drink after mines
    { kind: "white_energy_drink", x: 3350, y: GROUND_Y - 36 },
    // Section 4 nicotine pouch
    { kind: "nicotine_pouch", x: 4300, y: GROUND_Y - 36 },
    // Section 5 rainbow
    { kind: "rainbow", x: 5500, y: 270 },
    // Section 6 unicorn treat before swarm
    { kind: "unicorn_treat", x: 6200, y: GROUND_Y - 36 },
    // Section 6 extra rainbow
    { kind: "rainbow", x: 6800, y: 320 },
  ],
  hazards: [
    // Section 3 minefield — spaced so duck/jump gaps are survivable
    { kind: "landmine", x: 2480, y: GROUND_Y },
    { kind: "landmine", x: 2820, y: GROUND_Y },
    { kind: "landmine", x: 3160, y: GROUND_Y },
    { kind: "landmine", x: 3500, y: GROUND_Y },
    // Section 4 trash balloons (altitude randomized at runtime)
    { kind: "trash_balloon", x: 3600, y: GROUND_Y - 90 },
    { kind: "trash_balloon", x: 3800, y: GROUND_Y - 130 },
    { kind: "trash_balloon", x: 4000, y: GROUND_Y - 70 },
    { kind: "trash_balloon", x: 4200, y: GROUND_Y - 110 },
    { kind: "trash_balloon", x: 4400, y: GROUND_Y - 85 },
    // Section 5 dynamite
    { kind: "dynamite", x: 5050, y: GROUND_Y - 28, timerSeconds: 5 },
    { kind: "dynamite", x: 5300, y: GROUND_Y - 28, timerSeconds: 4 },
    { kind: "dynamite", x: 5600, y: GROUND_Y - 28, timerSeconds: 6 },
    { kind: "dynamite", x: 5900, y: GROUND_Y - 28, timerSeconds: 3 },
  ],
  enemies: [
    // Section 1 easy quad
    { kind: "quad", triggerX: 650, y: 260 },
    // Section 2 drone intro
    { kind: "quad", triggerX: 1300, y: 280 },
    { kind: "quad", triggerX: 1450, y: 240, delayMs: 400 },
    { kind: "fixed_wing", triggerX: 1550, y: 120 },
    { kind: "quad", triggerX: 1900, y: 300 },
    // Section 4 mixed
    { kind: "quad", triggerX: 3650, y: 250 },
    // Section 6 swarm
    { kind: "quad", triggerX: 6400, y: 260 },
    { kind: "quad", triggerX: 6550, y: 220, delayMs: 200 },
    { kind: "fpv", triggerX: 6650, y: 280, delayMs: 350 },
    { kind: "quad", triggerX: 6800, y: 240, delayMs: 500 },
    { kind: "fixed_wing", triggerX: 6950, y: 100, delayMs: 600 },
    { kind: "fpv", triggerX: 7100, y: 300, delayMs: 800 },
    { kind: "quad", triggerX: 7250, y: 260, delayMs: 1000 },
    // Section 7 final FPV
    { kind: "fpv", triggerX: 8700, y: 270 },
  ],
  extractionX: 9200,
};

// Fix enemies array - trash balloons are hazards not enemies, remove bad cast
LEVEL_1_CONFIG.enemies = LEVEL_1_CONFIG.enemies.filter(
  (e) => (e as { kind: string }).kind !== "trash_balloon",
);

export function getRainbowCowboyLevels(): RainbowCowboyLevel[] {
  return [LEVEL_1_META, LEVEL_2_META, LEVEL_3_META, ...LOCKED_LEVELS, LEVEL_5_META];
}

export function getRainbowCowboyLevelById(levelId: string): RainbowCowboyLevel | undefined {
  return getRainbowCowboyLevels().find((l) => l.id === levelId);
}

export function getLevelConfig(
  levelId: string,
  difficulty: RainbowCowboyDifficulty = "easy",
): LevelConfig | undefined {
  let base: LevelConfig | undefined;
  if (levelId === "level-1") base = LEVEL_1_CONFIG;
  else if (levelId === "level-2") base = LEVEL_2_CONFIG;
  else if (levelId === "level-3") base = LEVEL_3_CONFIG;
  else if (levelId === "level-5") base = LEVEL_5_CONFIG;
  if (!base) return undefined;
  return applyDifficulty(base, difficulty);
}
export function getNextPlayableLevel(currentLevelId: string): RainbowCowboyLevel | undefined {
  const levels = getRainbowCowboyLevels();
  const idx = levels.findIndex((l) => l.id === currentLevelId);
  if (idx < 0) return undefined;
  for (let i = idx + 1; i < levels.length; i++) {
    const level = levels[i];
    if (level.locked || level.status === "coming_soon") continue;
    if (getLevelConfig(level.id)) return level;
  }
  return undefined;
}
