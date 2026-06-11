import { LEVEL_4_FIRST_CLEAR_TOKENS } from "./rainbowCowboyConstants";

const TOKENS_KEY = "rainbow-cowboy-arcade-tokens";
const FIRST_CLEAR_KEY = "rainbow-cowboy-first-clears";
const ACHIEVEMENTS_KEY = "rainbow-cowboy-game-achievements";

const LEVEL_4_ACHIEVEMENT = "Drone Slayer Unlocked";

export type LevelFirstClearReward = {
  wasFirstClear: boolean;
  tokensEarned: number;
  achievementUnlocked: string | null;
  totalTokens: number;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function getArcadeTokenBalance(): number {
  const value = readJson<number>(TOKENS_KEY, 0);
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function hasGameAchievement(id: string): boolean {
  const set = readJson<string[]>(ACHIEVEMENTS_KEY, []);
  return set.includes(id);
}

export function getUnlockedGameAchievements(): string[] {
  return readJson<string[]>(ACHIEVEMENTS_KEY, []);
}

export function hasLevelFirstClear(levelId: string): boolean {
  const cleared = readJson<Record<string, boolean>>(FIRST_CLEAR_KEY, {});
  return cleared[levelId] === true;
}

/** Awards +5 tokens and the Drone Slayer achievement on first Level 4 clear only. */
export function awardLevel4FirstClearReward(): LevelFirstClearReward {
  const alreadyCleared = hasLevelFirstClear("level-4");
  if (alreadyCleared) {
    return {
      wasFirstClear: false,
      tokensEarned: 0,
      achievementUnlocked: null,
      totalTokens: getArcadeTokenBalance(),
    };
  }

  const cleared = readJson<Record<string, boolean>>(FIRST_CLEAR_KEY, {});
  cleared["level-4"] = true;
  writeJson(FIRST_CLEAR_KEY, cleared);

  const totalTokens = getArcadeTokenBalance() + LEVEL_4_FIRST_CLEAR_TOKENS;
  writeJson(TOKENS_KEY, totalTokens);

  const achievements = readJson<string[]>(ACHIEVEMENTS_KEY, []);
  let achievementUnlocked: string | null = null;
  if (!achievements.includes(LEVEL_4_ACHIEVEMENT)) {
    achievements.push(LEVEL_4_ACHIEVEMENT);
    writeJson(ACHIEVEMENTS_KEY, achievements);
    achievementUnlocked = LEVEL_4_ACHIEVEMENT;
  }

  return {
    wasFirstClear: true,
    tokensEarned: LEVEL_4_FIRST_CLEAR_TOKENS,
    achievementUnlocked,
    totalTokens,
  };
}
