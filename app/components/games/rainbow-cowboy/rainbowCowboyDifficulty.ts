import type {
  LevelConfig,
  LevelEnemySpawn,
  LevelPickupSpawn,
  RainbowCowboyDifficulty,
} from "./rainbowCowboyTypes";

export type { RainbowCowboyDifficulty } from "./rainbowCowboyTypes";

export const DIFFICULTY_OPTIONS: {
  id: RainbowCowboyDifficulty;
  label: string;
  description: string;
}[] = [
  { id: "easy", label: "Easy", description: "Standard enemy speed and count." },
  {
    id: "novice",
    label: "Novice",
    description: "Enemies 25% faster · 50% more spawns · a few extra powerups.",
  },
  {
    id: "hard",
    label: "Hard",
    description: "Enemies 50% faster · 100% more spawns · more powerups sprinkled in.",
  },
];

/** Boom Bot Alamo tuning — 20% easier across easy / novice / hard. */
const LEVEL_3_DIFFICULTY_SCALE = 0.8;

export function getDifficultySpeedMult(difficulty: RainbowCowboyDifficulty): number {
  if (difficulty === "novice") return 1.25;
  if (difficulty === "hard") return 1.5;
  return 1;
}

function thinEnemySpawns(spawns: LevelEnemySpawn[], keepRatio: number): LevelEnemySpawn[] {
  if (keepRatio >= 1 || spawns.length === 0) return spawns;
  const target = Math.max(1, Math.round(spawns.length * keepRatio));
  if (target >= spawns.length) return spawns;
  const sorted = [...spawns].sort((a, b) => a.triggerX - b.triggerX);
  const stride = sorted.length / target;
  const picked: LevelEnemySpawn[] = [];
  for (let i = 0; i < target; i++) {
    picked.push(sorted[Math.min(sorted.length - 1, Math.floor(i * stride))]);
  }
  return picked;
}

export function formatDifficultyLabel(difficulty: RainbowCowboyDifficulty): string {
  return DIFFICULTY_OPTIONS.find((o) => o.id === difficulty)?.label ?? difficulty;
}

export function getDifficultyBadgeColor(difficulty: RainbowCowboyDifficulty | string): string {
  if (difficulty === "hard") return "#ef4444";
  if (difficulty === "novice") return "#f59e0b";
  return "#22c55e";
}

function cloneExtraSpawns(spawns: LevelEnemySpawn[], fraction: number): LevelEnemySpawn[] {
  if (fraction <= 0 || spawns.length === 0) return [];
  const count = Math.max(1, Math.floor(spawns.length * fraction));
  const picked = [...spawns]
    .sort((a, b) => a.triggerX - b.triggerX)
    .filter((_, i) => i % Math.max(1, Math.floor(1 / fraction)) === 0)
    .slice(0, count);

  return picked.map((e, i) => ({
    ...e,
    triggerX: e.triggerX + 60 + i * 35,
    delayMs: (e.delayMs ?? 0) + 280 + i * 120,
    popupOnSpawn: undefined,
  }));
}

const SPRINKLE_PICKUP_KINDS = new Set<LevelPickupSpawn["kind"]>([
  "range_beer",
  "white_energy_drink",
  "nicotine_pouch",
  "rainbow",
  "unicorn_treat",
  "weapon_pistol",
  "weapon_machine_gun",
  "weapon_bazooka",
]);

function cloneExtraPickups(
  pickups: LevelPickupSpawn[],
  fraction: number,
  groundY: number,
): LevelPickupSpawn[] {
  if (fraction <= 0) return [];
  const eligible = pickups.filter((p) => SPRINKLE_PICKUP_KINDS.has(p.kind));
  if (eligible.length === 0) return [];
  const count = Math.max(1, Math.floor(eligible.length * fraction));
  return eligible.slice(0, count).map((p, i) => ({
    ...p,
    x: p.x + 45 + i * 30,
    y: p.y <= groundY - 20 ? p.y : groundY - 36,
  }));
}

function getLevelSupportPickups(
  base: LevelConfig,
  difficulty: RainbowCowboyDifficulty,
): LevelPickupSpawn[] {
  if (base.level.id === "level-5") {
    const ground = base.level.groundY;
    return [
      { kind: "rainbow", x: 4500, y: ground - 36 },
      { kind: "rainbow", x: 7500, y: ground - 36 },
      { kind: "white_energy_drink", x: 10100, y: ground - 36 },
    ];
  }

  if (base.level.id === "level-3") {
    const ground = base.level.groundY;
    return [
      // Mine pressure and drone mix
      { kind: "rainbow", x: 2700, y: ground - 36 },
      { kind: "rainbow", x: 6100, y: ground - 36 },
      // Armored bot stretch
      { kind: "rainbow", x: 8350, y: ground - 36 },
      // Grenade goblins into the Alamo
      { kind: "rainbow", x: 10850, y: ground - 36 },
      { kind: "rainbow", x: 12350, y: ground - 36 },
      // Final hold / extraction push
      { kind: "rainbow", x: 13650, y: ground - 36 },
      { kind: "rainbow", x: 14350, y: ground - 36 },
    ];
  }

  if (base.level.id !== "level-2" || difficulty !== "hard") return [];
  const ground = base.level.groundY;
  return [
    // First Red Baron approach
    { kind: "rainbow", x: 3900, y: ground - 36 },
    { kind: "white_energy_drink", x: 4550, y: ground - 36 },
    // Cliffside into nest complex
    { kind: "unicorn_treat", x: 5900, y: ground - 36 },
    { kind: "rainbow", x: 7350, y: ground - 36 },
    { kind: "white_energy_drink", x: 8050, y: ground - 36 },
    { kind: "rainbow", x: 9000, y: ground - 36 },
    // Balloon field and swarm corridor
    { kind: "unicorn_treat", x: 10350, y: ground - 36 },
    { kind: "rainbow", x: 11050, y: ground - 36 },
    { kind: "white_energy_drink", x: 12150, y: ground - 36 },
    { kind: "rainbow", x: 12750, y: ground - 36 },
    // Broken bridge / exit push
    { kind: "unicorn_treat", x: 13950, y: ground - 36 },
    { kind: "rainbow", x: 14650, y: ground - 36 },
    { kind: "white_energy_drink", x: 15350, y: ground - 36 },
  ];
}

export function applyDifficulty(
  base: LevelConfig,
  difficulty: RainbowCowboyDifficulty,
): LevelConfig {
  const isLevel3 = base.level.id === "level-3";
  let speedMult = getDifficultySpeedMult(difficulty);
  let extraEnemyFrac = difficulty === "hard" ? 1 : difficulty === "novice" ? 0.5 : 0;
  const extraPickupFrac = difficulty === "hard" ? 0.25 : difficulty === "novice" ? 0.12 : 0;
  const supportPickups = getLevelSupportPickups(base, difficulty);

  const baseEnemies = isLevel3
    ? thinEnemySpawns(base.enemies, LEVEL_3_DIFFICULTY_SCALE)
    : base.enemies;
  const baseFinalWaveEnemies = base.finalWave
    ? isLevel3
      ? thinEnemySpawns(base.finalWave.enemies, LEVEL_3_DIFFICULTY_SCALE)
      : base.finalWave.enemies
    : [];

  if (isLevel3) {
    speedMult *= LEVEL_3_DIFFICULTY_SCALE;
    extraEnemyFrac *= LEVEL_3_DIFFICULTY_SCALE;
  }

  const nests = base.nests?.map((n) => ({
    ...n,
    spawnIntervalMs: Math.round((n.spawnIntervalMs ?? 1000) / speedMult),
  }));

  const finalWave = base.finalWave
    ? {
        ...base.finalWave,
        enemies: [
          ...baseFinalWaveEnemies,
          ...cloneExtraSpawns(baseFinalWaveEnemies, extraEnemyFrac),
        ],
      }
    : undefined;

  return {
    ...base,
    difficulty,
    difficultySpeedMult: speedMult,
    enemies: [...baseEnemies, ...cloneExtraSpawns(baseEnemies, extraEnemyFrac)],
    pickups: [
      ...base.pickups,
      ...cloneExtraPickups(base.pickups, extraPickupFrac, base.level.groundY),
      ...supportPickups,
    ],
    nests,
    finalWave,
  };
}
