import type { RainbowCowboyProgressMap } from "./rainbowCowboyProgression";

export type CampaignBaseId =
  | "fob_thunder"
  | "camp_poseidon"
  | "camp_poseidon_trench"
  | "camp_gator_gulch"
  | "camp_poseidon_abyss"
  | "skywatch";

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

export function isCampPoseidonSecured(progress: RainbowCowboyProgressMap): boolean {
  return hasAnyCompletion(progress, "level-8");
}

export function isCampaignBaseUnlocked(baseId: CampaignBaseId, progress: RainbowCowboyProgressMap): boolean {
  if (baseId === "fob_thunder") return true;
  if (baseId === "skywatch") {
    return isFobThunderSecured(progress) && hasAnyCompletion(progress, "level-8");
  }
  if (baseId === "camp_poseidon_abyss") {
    return (
      isFobThunderSecured(progress) &&
      hasAnyCompletion(progress, "level-5") &&
      hasAnyCompletion(progress, "level-6") &&
      hasAnyCompletion(progress, "level-7")
    );
  }
  if (baseId === "camp_poseidon_trench") {
    return isFobThunderSecured(progress) && hasAnyCompletion(progress, "level-5");
  }
  if (baseId === "camp_gator_gulch") {
    return (
      isFobThunderSecured(progress) &&
      hasAnyCompletion(progress, "level-5") &&
      hasAnyCompletion(progress, "level-6")
    );
  }
  return isFobThunderSecured(progress);
}

export const CAMPAIGN_BASES: {
  id: CampaignBaseId;
  label: string;
  levelId?: string;
}[] = [
  { id: "fob_thunder", label: "FOB Thunder", levelId: HIVE_LEVEL_ID },
  { id: "camp_poseidon", label: "Camp Poseidon", levelId: "level-5" },
  { id: "camp_poseidon_trench", label: "Poseidon Trench", levelId: "level-6" },
  { id: "camp_gator_gulch", label: "Gator Gulch", levelId: "level-7" },
  { id: "camp_poseidon_abyss", label: "The Abyss", levelId: "level-8" },
  { id: "skywatch", label: "Skywatch" },
];
