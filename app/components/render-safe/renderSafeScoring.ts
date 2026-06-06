import type { RenderSafeRunResult } from "./renderSafeTypes";

export function getRenderSafeRank(score: number): string {
  if (score >= 1000) return "Chemlight Legend";
  if (score >= 800) return "Assault Saver";
  if (score >= 600) return "Route Clear";
  if (score >= 400) return "Team Guy";
  return "Cowboy Needs Rehearsal";
}

export function calculateTimeBonus(durationSeconds: number): number {
  if (durationSeconds < 480) return 100;
  if (durationSeconds < 720) return 50;
  return 0;
}

export function calculateCompletionBonus(
  mistakes: number,
  missionFailed: boolean,
): { completionBonus: number; perfectBonus: number } {
  if (missionFailed) return { completionBonus: 0, perfectBonus: 0 };
  const completionBonus = 300;
  const perfectBonus = mistakes === 0 ? 250 : 0;
  return { completionBonus, perfectBonus };
}

export function buildRunResult(params: {
  levelId: string;
  levelSlug: string;
  score: number;
  mistakes: number;
  durationSeconds: number;
  completed: boolean;
  compromised?: boolean;
  playerKilled?: boolean;
}): RenderSafeRunResult {
  return {
    levelId: params.levelId,
    levelSlug: params.levelSlug,
    score: params.score,
    rank: getRenderSafeRank(params.score),
    mistakes: params.mistakes,
    completed: params.completed,
    compromised: params.compromised ?? false,
    playerKilled: params.playerKilled ?? false,
    durationSeconds: params.durationSeconds,
    completedAt: new Date().toISOString(),
  };
}

export const SCORE_VALUES = {
  correctMarkBypass: 150,
  investigateThenMarkBypass: 125,
  bridgeRemoteMove: 200,
  noThreatInvestigated: 75,
  ignoreBenign: 25,
  markBenign: 25,
  tripWireSecure: 175,
} as const;
