import {
  HIVE_COMPLETE_BONUS,
  HIVE_NO_DAMAGE_BONUS,
  HIVE_FAST_TIME_BONUS,
} from "./rainbowCowboyHiveConstants";
import {
  ABYSS_COMPLETE_BONUS,
  ABYSS_FAST_TIME_BONUS,
  ABYSS_NO_DAMAGE_BONUS,
} from "./rainbowCowboyAbyssConstants";
import type { RainbowCowboyDifficulty, RainbowCowboyRunResult } from "./rainbowCowboyTypes";

export const DRONE_SCORES = {
  quad: 50,
  fpv: 150,
  fixed_wing: 150,
  recon: 75,
  red_baron: 250,
  cargo: 200,
  boom_bot: 100,
  armored_boom_bot: 200,
  grenade_goblin_bot: 250,
  hive_turret: 250,
  laser_shark: 175,
  laser_gator: 190,
} as const;

export const PICKUP_SCORES = {
  range_beer: 25,
  white_energy_drink: 25,
  nicotine_pouch: 50,
  rainbow: 50,
  unicorn_treat: 100,
  weapon_pistol: 50,
  weapon_machine_gun: 75,
  weapon_bazooka: 100,
  weapon_sonic: 90,
} as const;

export const NEST_DESTROY_SCORE = 500;
export const RAINBOW_BLAST_BONUS = 25;

export const LEVEL_1_COMPLETE_BONUS = 1000;
export const LEVEL_1_NO_DAMAGE_BONUS = 500;
export const LEVEL_1_FAST_TIME_BONUS = 250;

export const LEVEL_2_COMPLETE_BONUS = 1500;
export const LEVEL_2_NO_DAMAGE_BONUS = 750;
export const LEVEL_2_FAST_TIME_BONUS = 500;

export const LEVEL_3_COMPLETE_BONUS = 1500;
export const LEVEL_3_NO_DAMAGE_BONUS = 750;
export const LEVEL_3_FAST_TIME_BONUS = 500;
export const LEVEL_3_FINAL_WAVE_BONUS = 1000;

const LEVEL_1_RANKS: [number, string][] = [
  [3000, "Unicorn Legend"],
  [2200, "Rainbow Cowboy"],
  [1500, "Drone Eater"],
  [800, "Pasture Survivor"],
];

const LEVEL_2_RANKS: [number, string][] = [
  [5000, "Sky Marshal"],
  [4000, "Drone Slayer"],
  [3000, "Rainbow Cowboy"],
  [2000, "Valley Survivor"],
];

const LEVEL_3_RANKS: [number, string][] = [
  [5500, "Alamo Legend"],
  [4200, "Boom Bot Buster"],
  [3200, "Line Holder"],
  [2200, "Fort Survivor"],
];

const LEVEL_4_RANKS: [number, string][] = [
  [12000, "Hive Breaker"],
  [10000, "Thunder Chief"],
  [8000, "Swarm Killer"],
  [6000, "Drone Wrangler"],
];

export const LEVEL_5_COMPLETE_BONUS = 1500;
export const LEVEL_5_NO_DAMAGE_BONUS = 750;
export const LEVEL_5_FAST_TIME_BONUS = 500;

const LEVEL_5_RANKS: [number, string][] = [
  [4500, "Depth Charge"],
  [3500, "Mine Whisperer"],
  [2500, "Frogman"],
  [1500, "Bubble Rider"],
];

const LEVEL_6_RANKS: [number, string][] = [
  [4200, "Trench Lord"],
  [3200, "Creeper Dodger"],
  [2200, "Frogman II"],
  [1400, "Bubble Rider"],
];

const LEVEL_7_RANKS: [number, string][] = [
  [4000, "Dock Master"],
  [3000, "Log Weaver"],
  [2000, "Gator Bait Survivor"],
  [1300, "Lake Frog"],
];

const LEVEL_8_RANKS: [number, string][] = [
  [14000, "Abyss Breaker"],
  [11000, "Depth Escape Artist"],
  [8500, "Squid Slayer"],
  [6500, "Pressure Diver"],
];

export function getRainbowCowboyRank(levelId: string, score: number): string {
  const table =
    levelId === "level-8"
      ? LEVEL_8_RANKS
      : levelId === "level-7"
      ? LEVEL_7_RANKS
      : levelId === "level-6"
      ? LEVEL_6_RANKS
      : levelId === "level-5"
      ? LEVEL_5_RANKS
      : levelId === "level-4"
        ? LEVEL_4_RANKS
      : levelId === "level-3"
        ? LEVEL_3_RANKS
        : levelId === "level-2"
          ? LEVEL_2_RANKS
          : LEVEL_1_RANKS;
  for (const [threshold, rank] of table) {
    if (score >= threshold) return rank;
  }
  if (levelId === "level-4") return "Rookie Exterminator";
  if (levelId === "level-8") return "Bubble Fodder";
  if (levelId === "level-6") return "Guppy";
  if (levelId === "level-7") return "Tadpole";
  if (levelId === "level-5") return "Guppy";
  return "Pony Recruit";
}

function getLevelBonuses(levelId: string) {
  if (levelId === "level-8") {
    return {
      complete: ABYSS_COMPLETE_BONUS,
      noDamage: ABYSS_NO_DAMAGE_BONUS,
      fastTime: ABYSS_FAST_TIME_BONUS,
    };
  }
  if (levelId === "level-5" || levelId === "level-6" || levelId === "level-7") {
    return {
      complete: LEVEL_5_COMPLETE_BONUS,
      noDamage: LEVEL_5_NO_DAMAGE_BONUS,
      fastTime: LEVEL_5_FAST_TIME_BONUS,
    };
  }
  if (levelId === "level-4") {
    return {
      complete: HIVE_COMPLETE_BONUS,
      noDamage: HIVE_NO_DAMAGE_BONUS,
      fastTime: HIVE_FAST_TIME_BONUS,
    };
  }
  if (levelId === "level-3") {
    return {
      complete: LEVEL_3_COMPLETE_BONUS,
      noDamage: LEVEL_3_NO_DAMAGE_BONUS,
      fastTime: LEVEL_3_FAST_TIME_BONUS,
    };
  }
  if (levelId === "level-2") {
    return {
      complete: LEVEL_2_COMPLETE_BONUS,
      noDamage: LEVEL_2_NO_DAMAGE_BONUS,
      fastTime: LEVEL_2_FAST_TIME_BONUS,
    };
  }
  return {
    complete: LEVEL_1_COMPLETE_BONUS,
    noDamage: LEVEL_1_NO_DAMAGE_BONUS,
    fastTime: LEVEL_1_FAST_TIME_BONUS,
  };
}

export function buildRainbowCowboyRunResult(params: {
  levelId: string;
  levelSlug: string;
  baseScore: number;
  heartsRemaining: number;
  maxHearts: number;
  damageTaken: number;
  dronesEaten: number;
  balloonsSurvived: number;
  rainbowBlastsUsed: number;
  redBaronsDestroyed: number;
  nestsDestroyed: number;
  bombsDodged: number;
  durationSeconds: number;
  targetTimeSeconds: number;
  completed: boolean;
  completeBanner?: string;
  deathCause?: string;
  difficulty?: RainbowCowboyDifficulty;
  hiveBossDamage?: number;
  abyssBossDamage?: number;
  turretsDestroyed?: number;
}): RainbowCowboyRunResult {
  let score = params.baseScore;
  const bonuses = getLevelBonuses(params.levelId);

  if (params.completed) {
    score += bonuses.complete;
    if (params.damageTaken === 0) score += bonuses.noDamage;
    if (params.durationSeconds <= params.targetTimeSeconds) score += bonuses.fastTime;
  }

  return {
    levelId: params.levelId,
    levelSlug: params.levelSlug,
    score,
    rank: getRainbowCowboyRank(params.levelId, score),
    completed: params.completed,
    heartsRemaining: params.heartsRemaining,
    dronesEaten: params.dronesEaten,
    balloonsSurvived: params.balloonsSurvived,
    rainbowBlastsUsed: params.rainbowBlastsUsed,
    damageTaken: params.damageTaken,
    redBaronsDestroyed: params.redBaronsDestroyed,
    nestsDestroyed: params.nestsDestroyed,
    bombsDodged: params.bombsDodged,
    durationSeconds: params.durationSeconds,
    completeBanner: params.completeBanner,
    deathCause: params.deathCause,
    completedAt: new Date().toISOString(),
    difficulty: params.difficulty ?? "easy",
    hiveBossDamage: params.hiveBossDamage,
    abyssBossDamage: params.abyssBossDamage,
    turretsDestroyed: params.turretsDestroyed,
  };
}

export function getVictoryTitle(result: RainbowCowboyRunResult): string {
  if (!result.completed) return "Game Over";
  if (result.completeBanner) return result.completeBanner;
  return "Level Complete";
}
