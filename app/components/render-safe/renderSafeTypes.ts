export type RenderSafeActionId =
  | "mark_bypass"
  | "investigate"
  | "ignore"
  | "remote_move"
  | "bip"
  | "hands_on"
  | "cut_trip_line"
  | "trace_both_ends"
  | "hook_rope_pull"
  | "cut_and_secure"
  | "call_avalanche";

export type RenderSafeGameState =
  | "idle"
  | "briefing"
  | "playing"
  | "encounter"
  | "investigating"
  | "post_investigation_decision"
  | "action_animation"
  | "feedback"
  | "mission_failed"
  | "player_killed"
  | "completed";

export type RenderSafeEncounterType =
  | "disturbed_earth"
  | "suspicious_wire"
  | "abandoned_item"
  | "choke_point"
  | "bridge_crossing"
  | "trip_wire"
  | "target_building"
  | "final_room";

export interface RenderSafeAction {
  id: RenderSafeActionId;
  label: string;
  shortLabel: string;
  description: string;
  hotkey?: string;
}

export interface RenderSafeEncounterOutcome {
  isThreat: boolean;
  hasBypass: boolean;
  requiredResolution?: "mark_bypass" | "remote_move";
  investigationResult: string;
}

export interface RenderSafeEncounter {
  id: string;
  label: string;
  type: RenderSafeEncounterType;
  cue: string;
  lanePosition: number;
  x: number;
  /** Explicit tile column on the level map. */
  mapCol?: number;
  /** Explicit tile row on the level map (0 = north / target). */
  mapRow?: number;
  /** Benign route cue — safe to ignore, but still placed where the player can interact with it. */
  optionalDecoy?: boolean;
  /** Blocks northward movement until the encounter is resolved. */
  blocksPassage?: boolean;
  threatChance: number;
  canBypassIfThreat: boolean;
  isCriticalRoute: boolean;
  forceThreat?: boolean;
  forceNoThreat?: boolean;
  initialOptions: RenderSafeActionId[];
  postInvestigationOptions: RenderSafeActionId[];
  points: number;
  roomTitle?: string;
  ordnanceCache?: boolean;
  deferBypassMessage?: string;
  randomizeThreat?: boolean;
  doorMapCol?: number;
  doorMapRow?: number;
  concealThreatUntilInvestigated?: boolean;
  tripWireVariant?: "grenade_loose" | "mousetrap_tight";
}

export interface RenderSafeLevel {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  difficulty: string;
  description: string;
  missionBrief: string;
  objective: string;
  mapTheme: string;
  estimatedMinutes: string;
  encounters: RenderSafeEncounter[];
  locked?: boolean;
  status?: string;
  completionTitle?: string;
  completionSubtitle?: string;
}

export interface RenderSafeRunResult {
  levelId: string;
  levelSlug: string;
  score: number;
  rank: string;
  mistakes: number;
  completed: boolean;
  compromised: boolean;
  playerKilled: boolean;
  durationSeconds: number;
  completedAt: string;
  roomsCleared?: number;
  threatsIdentified?: number;
  correctDecisions?: number;
}

export interface RenderSafeEncounterRunState {
  isThreat: boolean;
  investigated: boolean;
  resolved: boolean;
  chemlightPlaced: boolean;
  /** Player has entered the mission space (door opened / interior revealed). */
  entered: boolean;
}

export interface RenderSafeRunState {
  encounterStates: Record<string, RenderSafeEncounterRunState>;
  score: number;
  mistakes: number;
  riskyNotes: number;
  resolvedCount: number;
  playerLane: number;
  playerX: number;
  startTime: number;
  missionStatus: string;
  feedbackMessage: string | null;
  feedbackType: "success" | "warning" | "none";
}

export type RenderSafeActionResult =
  | { type: "continue"; message: string; scoreDelta: number; mistake?: boolean; chemlight?: boolean; correctDecision?: boolean }
  | { type: "mission_failed"; message: string }
  | { type: "player_killed"; message: string }
  | { type: "investigate" }
  | { type: "level_complete"; message: string; scoreDelta: number };

export interface RenderSafePersonalBest {
  score: number;
  rank: string | null;
  mistakes: number;
  durationSeconds: number | null;
}
