import type { LevelConfig, RainbowCowboyPlayMode } from "./rainbowCowboyTypes";

export type RainbowCowboyWeaponFireMode = "none" | "hold" | "tap";

/** Single source of truth for mobile + instruction control layout per level. */
export type RainbowCowboyControlProfile = {
  swimMode: boolean;
  weaponEnabled: boolean;
  weaponSwapEnabled: boolean;
  weaponFireMode: RainbowCowboyWeaponFireMode;
  attackLabel: string;
  specialLabel: string;
};

export function isSwimPlayMode(playMode?: RainbowCowboyPlayMode): boolean {
  return playMode === "swim";
}

export function isFrogmanLevelId(levelId?: string): boolean {
  return (
    levelId === "level-5" ||
    levelId === "level-6" ||
    levelId === "level-7" ||
    levelId === "level-8"
  );
}

/** Matches {@link RainbowCowboyEngine} weapon availability. */
export function levelHasWeaponControls(config: Pick<LevelConfig, "level" | "playMode">): boolean {
  return (
    config.level.id === "level-3" ||
    config.level.id === "level-4" ||
    isSwimPlayMode(config.playMode)
  );
}

export function levelHasWeaponSwap(config: Pick<LevelConfig, "level" | "playMode">): boolean {
  return config.level.id === "level-4" || isSwimPlayMode(config.playMode);
}

export function levelUsesGunHold(config: Pick<LevelConfig, "level" | "playMode">): boolean {
  return levelHasWeaponControls(config) && !isSwimPlayMode(config.playMode);
}

export function getRainbowCowboyControlProfile(
  config: LevelConfig,
  labels: { attack: string; special: string },
): RainbowCowboyControlProfile {
  const swimMode = isSwimPlayMode(config.playMode);
  const weaponEnabled = levelHasWeaponControls(config);

  return {
    swimMode,
    weaponEnabled,
    weaponSwapEnabled: levelHasWeaponSwap(config),
    weaponFireMode: !weaponEnabled ? "none" : swimMode ? "tap" : "hold",
    attackLabel: labels.attack,
    specialLabel: labels.special,
  };
}

export function getRainbowCowboyControlProfileByLevelId(
  levelId: string | undefined,
  labels: { attack: string; special: string },
): RainbowCowboyControlProfile {
  const swimMode = isFrogmanLevelId(levelId);
  const weaponEnabled =
    levelId === "level-3" || levelId === "level-4" || swimMode;

  return {
    swimMode,
    weaponEnabled,
    weaponSwapEnabled: levelId === "level-4" || swimMode,
    weaponFireMode: !weaponEnabled ? "none" : swimMode ? "tap" : "hold",
    attackLabel: labels.attack,
    specialLabel: labels.special,
  };
}
