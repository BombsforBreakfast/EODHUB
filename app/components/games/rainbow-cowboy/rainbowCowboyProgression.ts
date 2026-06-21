import type { RainbowCowboyDifficulty, RainbowCowboyLevel } from "./rainbowCowboyTypes";
import {
  HIVE_LEVEL_ID,
  getHiveLockMessage,
  isFobThunderSecured,
  isHiveLevelUnlocked,
} from "./rainbowCowboyCampaign";

export type LevelProgress = Partial<Record<RainbowCowboyDifficulty, true>>;

export type RainbowCowboyProgressMap = Record<string, LevelProgress>;

const DIFFICULTY_CHAIN: RainbowCowboyDifficulty[] = ["easy", "novice", "hard"];

export function isPlayableLevelMeta(level: RainbowCowboyLevel): boolean {
  return !level.locked && level.status !== "coming_soon";
}

export function getPlayableLevels(levels: RainbowCowboyLevel[]): RainbowCowboyLevel[] {
  return levels.filter(isPlayableLevelMeta);
}

export function getPreviousPlayableLevel(
  levelId: string,
  levels: RainbowCowboyLevel[],
): RainbowCowboyLevel | undefined {
  const playable = getPlayableLevels(levels);
  const idx = playable.findIndex((l) => l.id === levelId);
  if (idx <= 0) return undefined;
  return playable[idx - 1];
}

function hasAnyCompletion(progress: LevelProgress | undefined): boolean {
  if (!progress) return false;
  return DIFFICULTY_CHAIN.some((d) => progress[d]);
}

export function isLevelUnlocked(
  levelId: string,
  progress: RainbowCowboyProgressMap,
  levels: RainbowCowboyLevel[],
): boolean {
  const level = levels.find((l) => l.id === levelId);
  if (!level || !isPlayableLevelMeta(level)) return false;

  if (levelId === HIVE_LEVEL_ID) {
    return isHiveLevelUnlocked(progress);
  }

  if (levelId === "level-5") {
    return isFobThunderSecured(progress);
  }

  if (levelId === "level-6") {
    return isFobThunderSecured(progress) && hasAnyCompletion(progress["level-5"]);
  }

  if (levelId === "level-7") {
    return isFobThunderSecured(progress) && hasAnyCompletion(progress["level-6"]);
  }

  if (levelId === "level-8") {
    return isFobThunderSecured(progress) && hasAnyCompletion(progress["level-7"]);
  }

  const previous = getPreviousPlayableLevel(levelId, levels);
  if (!previous) return true;

  if (previous.id === HIVE_LEVEL_ID) {
    return isFobThunderSecured(progress);
  }

  return hasAnyCompletion(progress[previous.id]);
}

export function isDifficultyUnlocked(
  levelId: string,
  difficulty: RainbowCowboyDifficulty,
  progress: RainbowCowboyProgressMap,
  levels: RainbowCowboyLevel[],
): boolean {
  if (!isLevelUnlocked(levelId, progress, levels)) return false;
  if (difficulty === "easy") return true;
  if (difficulty === "novice") return progress[levelId]?.easy === true;
  return progress[levelId]?.novice === true;
}

export function getLevelLockMessage(
  levelId: string,
  levels: RainbowCowboyLevel[],
): string | null {
  if (levelId === HIVE_LEVEL_ID) {
    return getHiveLockMessage();
  }
  if (levelId === "level-5") {
    return "Secure FOB Thunder (beat The Hive) to unlock";
  }
  if (levelId === "level-6") {
    return "Clear Deep Sea Rodeo to unlock";
  }
  if (levelId === "level-7") {
    return "Clear Poseidon Trench to unlock";
  }
  if (levelId === "level-8") {
    return "Clear Gator Gulch to unlock";
  }
  const previous = getPreviousPlayableLevel(levelId, levels);
  if (!previous) return null;
  if (previous.id === HIVE_LEVEL_ID) {
    return "Beat The Hive to unlock";
  }
  return `Beat ${previous.title} to unlock`;
}

export function getDifficultyLockMessage(difficulty: RainbowCowboyDifficulty): string | null {
  if (difficulty === "novice") return "Beat Easy on this level to unlock";
  if (difficulty === "hard") return "Beat Novice on this level to unlock";
  return null;
}

export function getHighestUnlockedDifficulty(
  levelId: string,
  progress: RainbowCowboyProgressMap,
  levels: RainbowCowboyLevel[],
): RainbowCowboyDifficulty {
  for (let i = DIFFICULTY_CHAIN.length - 1; i >= 0; i--) {
    const difficulty = DIFFICULTY_CHAIN[i];
    if (isDifficultyUnlocked(levelId, difficulty, progress, levels)) return difficulty;
  }
  return "easy";
}

export function applyCompletion(
  progress: RainbowCowboyProgressMap,
  levelId: string,
  difficulty: RainbowCowboyDifficulty,
): RainbowCowboyProgressMap {
  return {
    ...progress,
    [levelId]: {
      ...progress[levelId],
      [difficulty]: true,
    },
  };
}

/** Infer completions from a stored personal-best difficulty tier. */
export function progressFromPersonalBestDifficulty(
  difficulty: RainbowCowboyDifficulty | undefined,
): LevelProgress {
  if (!difficulty) return {};
  const idx = DIFFICULTY_CHAIN.indexOf(difficulty);
  if (idx < 0) return {};
  const out: LevelProgress = {};
  for (let i = 0; i <= idx; i++) {
    out[DIFFICULTY_CHAIN[i]] = true;
  }
  return out;
}

export function mergeProgressMaps(
  ...maps: RainbowCowboyProgressMap[]
): RainbowCowboyProgressMap {
  const merged: RainbowCowboyProgressMap = {};
  for (const map of maps) {
    for (const [levelId, tierProgress] of Object.entries(map)) {
      merged[levelId] = { ...merged[levelId], ...tierProgress };
    }
  }
  return merged;
}
