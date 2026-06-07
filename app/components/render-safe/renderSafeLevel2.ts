import type { RenderSafeEncounter, RenderSafeLevel } from "./renderSafeTypes";

const HALLWAY_OPTS = ["mark_bypass", "investigate", "ignore"] as const;
const HALLWAY_POST = ["mark_bypass", "remote_move", "bip", "hands_on"] as const;
const ORDNANCE_OPTS = ["mark_bypass", "bip", "ignore"] as const;
const ORDNANCE_POST = ["mark_bypass", "remote_move", "bip", "hands_on"] as const;
const EMPTY_OPTS = ["mark_bypass", "investigate", "ignore"] as const;
const EMPTY_POST = ["mark_bypass", "remote_move", "bip", "hands_on"] as const;

export const LEVEL_2_ENCOUNTERS: RenderSafeEncounter[] = [
  {
    id: "hallway-tripline-alpha",
    label: "Hallway Tripline",
    type: "suspicious_wire",
    roomTitle: "Central Hallway",
    cue: "A thin wire stretches across the corridor at ankle height.",
    lanePosition: 12,
    x: 50,
    mapCol: 12,
    mapRow: 72,
    threatChance: 100,
    forceThreat: true,
    canBypassIfThreat: true,
    isCriticalRoute: true,
    blocksPassage: true,
    initialOptions: [...HALLWAY_OPTS],
    postInvestigationOptions: [...HALLWAY_POST],
    points: 150,
  },
  {
    id: "hallway-doorway-bravo",
    label: "Suspicious Doorway",
    type: "suspicious_wire",
    roomTitle: "Hallway Junction",
    cue: "The doorway frame looks disturbed. Something may have been placed here.",
    lanePosition: 22,
    x: 50,
    mapCol: 13,
    mapRow: 62,
    threatChance: 45,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: [...HALLWAY_OPTS],
    postInvestigationOptions: [...HALLWAY_POST],
    points: 100,
  },
  {
    id: "room-a",
    label: "Room A",
    type: "abandoned_item",
    roomTitle: "Room A",
    cue: "A small side room off the hallway. Debris and empty shelves.",
    lanePosition: 18,
    x: 25,
    mapCol: 6,
    mapRow: 68,
    threatChance: 0,
    forceNoThreat: true,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: [...EMPTY_OPTS],
    postInvestigationOptions: [...EMPTY_POST],
    points: 75,
  },
  {
    id: "room-b",
    label: "Room B",
    type: "abandoned_item",
    roomTitle: "Room B",
    cue: "Boxes and loose munitions are stacked against the wall.",
    lanePosition: 28,
    x: 75,
    mapCol: 18,
    mapRow: 58,
    threatChance: 100,
    forceThreat: true,
    ordnanceCache: true,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    deferBypassMessage:
      "Not yet, cowboy. There is still more building to clear.",
    initialOptions: [...ORDNANCE_OPTS],
    postInvestigationOptions: [...ORDNANCE_POST],
    points: 150,
  },
  {
    id: "room-c",
    label: "Room C",
    type: "abandoned_item",
    roomTitle: "Room C",
    cue: "Another side room. Hard to tell if anything was staged here.",
    lanePosition: 38,
    x: 25,
    mapCol: 6,
    mapRow: 48,
    threatChance: 50,
    randomizeThreat: true,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    ordnanceCache: true,
    deferBypassMessage:
      "Not yet, cowboy. There is still more building to clear.",
    initialOptions: [...ORDNANCE_OPTS],
    postInvestigationOptions: [...ORDNANCE_POST],
    points: 100,
  },
  {
    id: "room-d",
    label: "Room D",
    type: "suspicious_wire",
    roomTitle: "Room D",
    cue: "Tripwire indicators run along the baseboard into the room.",
    lanePosition: 48,
    x: 75,
    mapCol: 18,
    mapRow: 38,
    threatChance: 100,
    forceThreat: true,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    initialOptions: [...HALLWAY_OPTS],
    postInvestigationOptions: [...HALLWAY_POST],
    points: 150,
  },
  {
    id: "room-e",
    label: "Room E",
    type: "abandoned_item",
    roomTitle: "Room E",
    cue: "A larger cache of ordnance is visible in the corner.",
    lanePosition: 58,
    x: 25,
    mapCol: 6,
    mapRow: 28,
    threatChance: 100,
    forceThreat: true,
    ordnanceCache: true,
    canBypassIfThreat: true,
    isCriticalRoute: false,
    deferBypassMessage: "Still not time. Keep moving.",
    initialOptions: [...ORDNANCE_OPTS],
    postInvestigationOptions: [...ORDNANCE_POST],
    points: 150,
  },
  {
    id: "hallway-tripline-charlie",
    label: "Hallway Tripline",
    type: "suspicious_wire",
    roomTitle: "Upper Hallway",
    cue: "Another wire spans the corridor ahead of the final room.",
    lanePosition: 68,
    x: 50,
    mapCol: 12,
    mapRow: 18,
    threatChance: 100,
    forceThreat: true,
    canBypassIfThreat: true,
    isCriticalRoute: true,
    blocksPassage: true,
    initialOptions: [...HALLWAY_OPTS],
    postInvestigationOptions: [...HALLWAY_POST],
    points: 150,
  },
  {
    id: "final-room",
    label: "Final Room",
    type: "final_room",
    roomTitle: "Final Room",
    cue: "Multiple 55-gallon drums. A timer is counting down. THREAT CONFIRMED.",
    lanePosition: 92,
    x: 50,
    mapCol: 12,
    mapRow: 2,
    threatChance: 100,
    forceThreat: true,
    canBypassIfThreat: false,
    isCriticalRoute: true,
    initialOptions: ["hands_on", "call_avalanche"],
    postInvestigationOptions: ["hands_on", "call_avalanche"],
    points: 500,
  },
];

export const LEVEL_2: RenderSafeLevel = {
  id: "level-2",
  slug: "clearing-rooms",
  title: "Clearing Rooms",
  subtitle: "Get everyone out alive.",
  difficulty: "Basic",
  description:
    "Clear a hostile structure room by room, identify hazards, and evacuate before the threat detonates.",
  missionBrief: `The assault force has entered the objective building.

Your mission is not complete.

Continue clearing the structure, identify hazards, keep the assault moving, and make good decisions.

Not every room contains a threat.

Not every threat requires immediate action.

Maintain momentum.

Protect the force.

Get everyone out alive.`,
  objective: "Clear the structure and reach the final room. Evacuate the force safely.",
  mapTheme: "building_interior",
  estimatedMinutes: "8–12 minutes",
  completionTitle: "STRUCTURE CLEARED",
  completionSubtitle: "Good call. Everyone got out safely.",
  encounters: LEVEL_2_ENCOUNTERS,
};

export function prepareLevel2Encounters(
  encounters: RenderSafeEncounter[],
  seed: number,
): RenderSafeEncounter[] {
  let t = seed >>> 0;
  const rand = () => {
    t += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return encounters.map((enc) => {
    if (!enc.randomizeThreat) return enc;
    const isThreat = rand() >= 0.5;
    return {
      ...enc,
      forceThreat: isThreat,
      forceNoThreat: !isThreat,
      ordnanceCache: isThreat,
      cue: isThreat
        ? "Loose munitions are stacked in the corner."
        : "Another side room. Nothing obvious staged here.",
      initialOptions: isThreat ? [...ORDNANCE_OPTS] : [...EMPTY_OPTS],
      postInvestigationOptions: isThreat ? [...ORDNANCE_POST] : [...EMPTY_POST],
      points: isThreat ? 150 : 75,
    };
  });
}
