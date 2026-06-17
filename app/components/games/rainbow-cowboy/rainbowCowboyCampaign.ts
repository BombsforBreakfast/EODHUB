import type { RainbowCowboyProgressMap } from "./rainbowCowboyProgression";

export type CampaignBaseId = "fob_thunder" | "camp_poseidon" | "skywatch";

export const HIVE_LEVEL_ID = "level-4";

function hasAnyCompletion(progress: RainbowCowboyProgressMap, levelId: string): boolean {
  const tier = progress[levelId];
  if (!tier) return false;
  return tier.easy === true || tier.novice === true || tier.hard === true;
}

/** Boss level unlocks after clearing all three Base 1 missions. */
export function isHiveLevelUnlocked(progress: RainbowCowboyProgressMap): boolean {
  return (
    hasAnyCompletion(progress, "level-1") &&
    hasAnyCompletion(progress, "level-2") &&
    hasAnyCompletion(progress, "level-3")
  );
}

export function getHiveLockMessage(): string {
  return "Beat Pasture of Peril, Drone Valley, and Boom Bot Alamo to unlock";
}

export function isFobThunderSecured(progress: RainbowCowboyProgressMap): boolean {
  return hasAnyCompletion(progress, HIVE_LEVEL_ID);
}

export function isCampaignBaseUnlocked(baseId: CampaignBaseId, progress: RainbowCowboyProgressMap): boolean {
  if (baseId === "fob_thunder") return true;
  return isFobThunderSecured(progress);
}

export const CAMPAIGN_BASES: {
  id: CampaignBaseId;
  label: string;
  levelId?: string;
}[] = [
  { id: "fob_thunder", label: "FOB Thunder", levelId: HIVE_LEVEL_ID },
  { id: "camp_poseidon", label: "Camp Poseidon", levelId: "level-5" },
  { id: "skywatch", label: "Skywatch", levelId: "level-6" },
];
