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
  attack_drone: 125,
  suicide_drone: 100,
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

export const LEVEL_4_COMPLETE_BONUS = 1200;
export const LEVEL_4_NO_DAMAGE_BONUS = 600;
export const LEVEL_4_FAST_TIME_BONUS = 400;
export const LEVEL_4_BOSS_BONUS = 800;

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
  [4500, "Nest Annihilator"],
  [3500, "Drone Slayer"],
  [2600, "Arena Survivor"],
  [1800, "Boss Brawler"],
];

export function getRainbowCowboyRank(levelId: string, score: number): string {
  const table =
    levelId === "level-4"
      ? LEVEL_4_RANKS
      : levelId === "level-3"
        ? LEVEL_3_RANKS
        : levelId === "level-2"
          ? LEVEL_2_RANKS
          : LEVEL_1_RANKS;
  for (const [threshold, rank] of table) {
    if (score >= threshold) return rank;
  }
  return "Pony Recruit";
}

function getLevelBonuses(levelId: string) {
  if (levelId === "level-4") {
    return {
      complete: LEVEL_4_COMPLETE_BONUS,
      noDamage: LEVEL_4_NO_DAMAGE_BONUS,
      fastTime: LEVEL_4_FAST_TIME_BONUS,
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
  arcadeTokensEarned?: number;
  gameAchievementUnlocked?: string;
  bossDamageDealt?: number;
  bossDefeated?: boolean;
}): RainbowCowboyRunResult {
  let score = params.baseScore;
  const bonuses = getLevelBonuses(params.levelId);

  if (params.completed) {
    score += bonuses.complete;
    if (params.damageTaken === 0) score += bonuses.noDamage;
    if (params.durationSeconds <= params.targetTimeSeconds) score += bonuses.fastTime;
    if (params.bossDefeated) score += LEVEL_4_BOSS_BONUS;
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
    arcadeTokensEarned: params.arcadeTokensEarned,
    gameAchievementUnlocked: params.gameAchievementUnlocked,
    bossDamageDealt: params.bossDamageDealt,
  };
}

export function getVictoryTitle(result: RainbowCowboyRunResult): string {
  if (!result.completed) return "Game Over";
  if (result.completeBanner) return result.completeBanner;
  return "Level Complete";
}
