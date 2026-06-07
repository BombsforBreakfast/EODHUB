import type { RainbowCowboyRunResult } from "./rainbowCowboyTypes";

export const DRONE_SCORES = {
  quad: 50,
  fpv: 150,
  fixed_wing: 150,
  recon: 75,
  red_baron: 250,
  cargo: 200,
} as const;

export const PICKUP_SCORES = {
  range_beer: 25,
  white_monster: 25,
  zyn_tin: 50,
  rainbow: 50,
  unicorn_treat: 100,
} as const;

export const NEST_DESTROY_SCORE = 500;
export const RAINBOW_BLAST_BONUS = 25;

export const LEVEL_1_COMPLETE_BONUS = 1000;
export const LEVEL_1_NO_DAMAGE_BONUS = 500;
export const LEVEL_1_FAST_TIME_BONUS = 250;

export const LEVEL_2_COMPLETE_BONUS = 1500;
export const LEVEL_2_NO_DAMAGE_BONUS = 750;
export const LEVEL_2_FAST_TIME_BONUS = 500;

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

export function getRainbowCowboyRank(levelId: string, score: number): string {
  const table = levelId === "level-2" ? LEVEL_2_RANKS : LEVEL_1_RANKS;
  for (const [threshold, rank] of table) {
    if (score >= threshold) return rank;
  }
  return "Pony Recruit";
}

function getLevelBonuses(levelId: string) {
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
  };
}

export function getVictoryTitle(result: RainbowCowboyRunResult): string {
  if (!result.completed) return "Game Over";
  if (result.completeBanner) return result.completeBanner;
  return "Level Complete";
}
