import type { RenderSafeEncounter, RenderSafeLevel } from "./renderSafeTypes";

// Future levels should use the same RenderSafeLevel shape.
// Keep all level logic data-driven where possible.
// Avoid hardcoding level-specific behavior inside the main game component.

const LEVEL_1_ENCOUNTERS: RenderSafeEncounter[] = [
  {
    id: "disturbed-earth-alpha",
    label: "Disturbed Earth",
    type: "disturbed_earth",
    cue: "A small mound of disturbed earth blocks the narrow lane. Mark and bypass, or investigate first.",
    lanePosition: 8,
    x: 50,
    mapCol: 9,
    mapRow: 16,
    threatChance: 50,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "suspicious-wire-bravo",
    label: "Suspicious Wire",
    type: "suspicious_wire",
    cue: "A faint line runs from the brush edge across the forward lane. Loop wide or deal with the cue.",
    lanePosition: 14,
    x: 40,
    mapCol: 7,
    mapRow: 14,
    threatChance: 40,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "abandoned-pack-charlie",
    label: "Abandoned Pack",
    type: "abandoned_item",
    cue: "An abandoned pack sits in the lane ahead. Brush walls force a tight pass around it.",
    lanePosition: 18,
    x: 65,
    mapCol: 16,
    mapRow: 18,
    threatChance: 30,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "route-pinch-india",
    label: "Route Pinch",
    type: "choke_point",
    cue: "The path narrows to a single file between berms. Disturbed ground sits on the assault lane.",
    lanePosition: 22,
    x: 50,
    mapCol: 12,
    mapRow: 11,
    threatChance: 55,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "choke-point-delta",
    label: "Narrow Choke Point",
    type: "choke_point",
    cue: "The route narrows between walls. Ground near the entry looks recently disturbed.",
    lanePosition: 26,
    x: 50,
    mapCol: 9,
    mapRow: 8,
    threatChance: 60,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "disturbed-earth-echo",
    label: "Disturbed Earth",
    type: "disturbed_earth",
    cue: "Fresh dig along the only forward trace. The force has to pass close — clear it or bypass wide.",
    lanePosition: 34,
    x: 55,
    mapCol: 13,
    mapRow: 24,
    threatChance: 45,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "trip-wire-juliet",
    label: "Trip Line",
    type: "trip_wire",
    cue: "A low trip line spans the lane. The assault force cannot pass until it is handled.",
    lanePosition: 42,
    x: 50,
    mapCol: 12,
    mapRow: 32,
    blocksPassage: true,
    threatChance: 100,
    forceThreat: true,
    canBypassIfThreat: false,
    isCriticalRoute: true,
    initialOptions: ["cut_trip_line", "trace_both_ends", "hook_rope_pull"],
    postInvestigationOptions: ["cut_and_secure"],
    points: 175,
  },
  {
    id: "suspicious-wire-kilo",
    label: "Suspicious Wire",
    type: "suspicious_wire",
    cue: "Wire tension visible across the path where the route bends east. No clean way through without a decision.",
    lanePosition: 50,
    x: 45,
    mapCol: 10,
    mapRow: 40,
    threatChance: 50,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "abandoned-pack-lima",
    label: "Abandoned Pack",
    type: "abandoned_item",
    cue: "A pack blocks the center of the trail. Walls on both sides — bypass tight or handle the cue.",
    lanePosition: 58,
    x: 60,
    mapCol: 15,
    mapRow: 48,
    threatChance: 35,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "choke-point-mike",
    label: "Narrow Choke Point",
    type: "choke_point",
    cue: "Berms pinch the lane again. Disturbed soil right where the team must step.",
    lanePosition: 64,
    x: 50,
    mapCol: 11,
    mapRow: 54,
    threatChance: 55,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "disturbed-earth-november",
    label: "Disturbed Earth",
    type: "disturbed_earth",
    cue: "A mound sits on the bend before the final push north. The assault lane runs straight through it.",
    lanePosition: 72,
    x: 52,
    mapCol: 12,
    mapRow: 62,
    threatChance: 40,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "suspicious-wire-oscar",
    label: "Suspicious Wire",
    type: "suspicious_wire",
    cue: "A line crosses the path near the lower assembly area. Last major cue before the canal.",
    lanePosition: 78,
    x: 48,
    mapCol: 11,
    mapRow: 68,
    threatChance: 45,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 150,
  },
  {
    id: "brush-decoy-golf",
    label: "Brush Line",
    type: "suspicious_wire",
    cue: "A faint line disappears into brush beside a tight bend in the assault lane.",
    lanePosition: 46,
    x: 10,
    mapCol: 2,
    mapRow: 44,
    forceNoThreat: true,
    threatChance: 35,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 0,
  },
  {
    id: "brush-decoy-hotel",
    label: "Brush Mound",
    type: "disturbed_earth",
    cue: "Disturbed earth sits just off the worn trace where the path narrows through brush.",
    lanePosition: 70,
    x: 90,
    mapCol: 23,
    mapRow: 52,
    forceNoThreat: true,
    threatChance: 45,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 0,
  },
  {
    id: "bridge-crossing-echo",
    label: "Bridge Crossing",
    type: "bridge_crossing",
    cue: "A narrow bridge crosses the canal. There is no alternate route. Disturbed earth is visible near the crossing.",
    lanePosition: 88,
    x: 50,
    mapCol: 11,
    mapRow: 4,
    threatChance: 100,
    forceThreat: true,
    canBypassIfThreat: false,
    isCriticalRoute: true,
    initialOptions: ["mark_bypass", "investigate", "ignore"],
    postInvestigationOptions: ["mark_bypass", "remote_move", "bip", "hands_on"],
    points: 200,
  },
  {
    id: "target-building-foxtrot",
    label: "Target Building",
    type: "target_building",
    cue: "The assault force reaches the target building.",
    lanePosition: 96,
    x: 50,
    mapCol: 12,
    mapRow: 1,
    threatChance: 0,
    forceNoThreat: true,
    canBypassIfThreat: false,
    isCriticalRoute: false,
    initialOptions: [],
    postInvestigationOptions: [],
    points: 0,
  },
];

export const LEVEL_1: RenderSafeLevel = {
  id: "level-1",
  slug: "chemlight-cowboy",
  title: "Chemlight Cowboy",
  subtitle: "Get the assault force to the target.",
  difficulty: "Recruit",
  description: "Lead the assault force through an extended night raid route to the target building.",
  missionBrief: `You are a Direct Action EOD tech providing dismounted support for a kill/capture raid.

The assault force is moving on foot toward a target building.

Your job is to get the team to the target safely without compromising the mission.

Not every indicator is a threat. Not every threat requires the same decision.

Some cues sit off the route — ignore them and keep the force moving.

Trip lines may block the lane entirely. Trace before you cut.

Move deliberately, read the cues, and do not be a hero, cowboy.`,
  objective: "Move the assault force to the target building without casualties or compromising the raid.",
  mapTheme: "night_raid_route",
  estimatedMinutes: "8–12 minutes",
  encounters: LEVEL_1_ENCOUNTERS,
};

// Future levels should use the same RenderSafeLevel shape.
// Keep all level logic data-driven where possible.
// Avoid hardcoding level-specific behavior inside the main game component.
// Additional levels will be added here when ready — not shown in the UI until playable.

export function getRenderSafeLevels(): RenderSafeLevel[] {
  return [LEVEL_1];
}

export function getRenderSafeLevelById(levelId: string): RenderSafeLevel | undefined {
  return getRenderSafeLevels().find((l) => l.id === levelId);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Drop ~25% of optional route hazards each run; keep blockers, bridge, choke points, and target. */
export function applyRandomizedHazardReduction(
  encounters: RenderSafeEncounter[],
  seed: number,
): RenderSafeEncounter[] {
  const rand = mulberry32(seed ^ 0x7f4a7c15);
  return encounters.filter((enc) => {
    if (
      enc.type === "target_building" ||
      enc.type === "choke_point" ||
      enc.blocksPassage ||
      enc.type === "bridge_crossing"
    ) {
      return true;
    }
    return rand() >= 0.25;
  });
}

export function rollEncounterThreats(
  encounters: RenderSafeEncounter[],
): Record<string, { isThreat: boolean }> {
  const result: Record<string, { isThreat: boolean }> = {};
  for (const enc of encounters) {
    if (enc.type === "target_building") {
      result[enc.id] = { isThreat: false };
    } else if (enc.type === "trip_wire") {
      result[enc.id] = { isThreat: true };
    } else if (enc.forceThreat) {
      result[enc.id] = { isThreat: true };
    } else if (enc.forceNoThreat) {
      result[enc.id] = { isThreat: false };
    } else {
      result[enc.id] = { isThreat: Math.random() * 100 < enc.threatChance * 0.75 };
    }
  }
  return result;
}

/** Encounters that count toward mission progress (excludes decoys and finish line). */
export function getMandatoryEncounters(level: RenderSafeLevel): RenderSafeEncounter[] {
  return level.encounters.filter(
    (e) => e.type !== "target_building" && !e.optionalDecoy,
  );
}
