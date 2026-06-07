import type { RainbowCowboyRunResult } from "./rainbowCowboyTypes";

export const DRONE_SCORES = {
  quad: 50,
  fpv: 100,
  fixed_wing: 150,
} as const;

export const PICKUP_SCORES = {
  range_beer: 25,
  white_monster: 25,
  zyn_tin: 50,
  rainbow: 50,
  unicorn_treat: 100,
} as const;

export const RAINBOW_BLAST_BONUS = 25;
export const LEVEL_COMPLETE_BONUS = 1000;
export const NO_DAMAGE_BONUS = 500;
export const FAST_TIME_BONUS = 250;

export function getRainbowCowboyRank(score: number): string {
  if (score >= 3000) return "Unicorn Legend";
  if (score >= 2200) return "Rainbow Cowboy";
  if (score >= 1500) return "Drone Eater";
  if (score >= 800) return "Pasture Survivor";
  return "Pony Recruit";
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
  durationSeconds: number;
  targetTimeSeconds: number;
  completed: boolean;
  deathCause?: string;
}): RainbowCowboyRunResult {
  let score = params.baseScore;

  if (params.completed) {
    score += LEVEL_COMPLETE_BONUS;
    if (params.damageTaken === 0) score += NO_DAMAGE_BONUS;
    if (params.durationSeconds <= params.targetTimeSeconds) score += FAST_TIME_BONUS;
  }

  return {
    levelId: params.levelId,
    levelSlug: params.levelSlug,
    score,
    rank: getRainbowCowboyRank(score),
    completed: params.completed,
    heartsRemaining: params.heartsRemaining,
    dronesEaten: params.dronesEaten,
    balloonsSurvived: params.balloonsSurvived,
    rainbowBlastsUsed: params.rainbowBlastsUsed,
    damageTaken: params.damageTaken,
    durationSeconds: params.durationSeconds,
    deathCause: params.deathCause,
    completedAt: new Date().toISOString(),
  };
}
