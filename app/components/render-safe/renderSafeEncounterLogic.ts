import { TILE_SIZE, encounterToTile } from "./renderSafeMap";
import { SCORE_VALUES } from "./renderSafeScoring";
import { RENDER_SAFE_FEEDBACK } from "./renderSafeActions";
import type {
  RenderSafeActionId,
  RenderSafeActionResult,
  RenderSafeEncounter,
  RenderSafeEncounterRunState,
} from "./renderSafeTypes";

export function resolveEncounterAction(
  encounter: RenderSafeEncounter,
  actionId: RenderSafeActionId,
  encounterState: RenderSafeEncounterRunState,
  phase: "initial" | "post_investigation",
): RenderSafeActionResult {
  const { isThreat } = encounterState;
  const isBridge = encounter.type === "bridge_crossing";
  const isTripWire = encounter.type === "trip_wire";

  if (isTripWire) {
    if (actionId === "trace_both_ends" && phase === "initial") {
      return { type: "investigate" };
    }
    if (actionId === "cut_trip_line" && phase === "initial") {
      return { type: "mission_failed", message: RENDER_SAFE_FEEDBACK.tripWireCutAlone };
    }
    if (actionId === "hook_rope_pull") {
      return { type: "mission_failed", message: RENDER_SAFE_FEEDBACK.tripWireHookPull };
    }
    if (actionId === "cut_and_secure" && phase === "post_investigation" && encounterState.investigated) {
      return {
        type: "continue",
        message: RENDER_SAFE_FEEDBACK.tripWireSecureSuccess,
        scoreDelta: SCORE_VALUES.tripWireSecure,
      };
    }
    if (actionId === "cut_trip_line" && phase === "post_investigation") {
      return { type: "mission_failed", message: RENDER_SAFE_FEEDBACK.tripWireCutAlone };
    }
  }

  if (actionId === "investigate" && phase === "initial") {
    return { type: "investigate" };
  }

  if (actionId === "ignore") {
    if (encounter.optionalDecoy) {
      return {
        type: "continue",
        message: RENDER_SAFE_FEEDBACK.decoyIgnored,
        scoreDelta: SCORE_VALUES.ignoreBenign,
      };
    }
    if (isTripWire) {
      return { type: "mission_failed", message: RENDER_SAFE_FEEDBACK.ignoreThreat };
    }
    if (isThreat) {
      return { type: "mission_failed", message: RENDER_SAFE_FEEDBACK.ignoreThreat };
    }
    return {
      type: "continue",
      message: "",
      scoreDelta: SCORE_VALUES.ignoreBenign,
    };
  }

  if (actionId === "mark_bypass") {
    if (!encounter.canBypassIfThreat && isThreat) {
      return { type: "continue", message: "", scoreDelta: 0 };
    }
    if (isThreat) {
      const scoreDelta = encounterState.investigated
        ? SCORE_VALUES.investigateThenMarkBypass
        : SCORE_VALUES.correctMarkBypass;
      return {
        type: "continue",
        message: RENDER_SAFE_FEEDBACK.correctMarkBypass,
        scoreDelta,
        chemlight: true,
      };
    }
    if (encounter.optionalDecoy) {
      return {
        type: "continue",
        message: RENDER_SAFE_FEEDBACK.decoyWastedTime,
        scoreDelta: SCORE_VALUES.markBenign,
        mistake: true,
      };
    }
    return {
      type: "continue",
      message: RENDER_SAFE_FEEDBACK.benignCueMarked,
      scoreDelta: SCORE_VALUES.markBenign,
      mistake: true,
      chemlight: true,
    };
  }

  if (actionId === "remote_move") {
    if (isBridge && isThreat) {
      return {
        type: "continue",
        message: RENDER_SAFE_FEEDBACK.bridgeRemoteMove,
        scoreDelta: SCORE_VALUES.bridgeRemoteMove,
      };
    }
    if (isThreat && encounter.canBypassIfThreat) {
      return {
        type: "mission_failed",
        message: RENDER_SAFE_FEEDBACK.remoteMoveWhenBypassAvailable,
      };
    }
    return {
      type: "mission_failed",
      message: RENDER_SAFE_FEEDBACK.remoteMoveWhenBypassAvailable,
    };
  }

  if (actionId === "bip") {
    return { type: "mission_failed", message: RENDER_SAFE_FEEDBACK.bip };
  }

  if (actionId === "hands_on") {
    return { type: "player_killed", message: RENDER_SAFE_FEEDBACK.handsOn };
  }

  if (phase === "post_investigation" && !isThreat) {
    if (encounter.optionalDecoy) {
      return {
        type: "continue",
        message: RENDER_SAFE_FEEDBACK.decoyWastedTime,
        scoreDelta: SCORE_VALUES.noThreatInvestigated,
        mistake: true,
      };
    }
    return {
      type: "continue",
      message: RENDER_SAFE_FEEDBACK.noThreatAfterInvestigation,
      scoreDelta: SCORE_VALUES.noThreatInvestigated,
    };
  }

  return { type: "continue", message: "", scoreDelta: 0 };
}

export function getInvestigationResult(encounter: RenderSafeEncounter, isThreat: boolean): string {
  if (encounter.type === "trip_wire") {
    return RENDER_SAFE_FEEDBACK.tripWireTraceResult;
  }
  return isThreat
    ? RENDER_SAFE_FEEDBACK.investigationThreat
    : RENDER_SAFE_FEEDBACK.investigationNoThreat;
}

export function getInvestigationLabel(encounter: RenderSafeEncounter): string {
  if (encounter.type === "trip_wire") {
    return "Tracing line both directions…";
  }
  return RENDER_SAFE_FEEDBACK.investigationScanning;
}

export function isMarkBypassDisabled(encounter: RenderSafeEncounter): boolean {
  return !encounter.canBypassIfThreat;
}

export function getMarkBypassDisabledReason(encounter: RenderSafeEncounter): string | null {
  if (!encounter.canBypassIfThreat) {
    return RENDER_SAFE_FEEDBACK.markBypassDisabledReason;
  }
  return null;
}

export function isPassageBlocked(
  encounters: RenderSafeEncounter[],
  playerY: number,
  newY: number,
  isResolved: (id: string) => boolean,
): boolean {
  if (newY >= playerY) return false;

  for (const enc of encounters) {
    if (!enc.blocksPassage || isResolved(enc.id)) continue;
    const { row } = encounterToTile(enc);
    const blockLineY = row * TILE_SIZE + TILE_SIZE / 2;
    if (playerY >= blockLineY - 6 && newY < blockLineY - 2) {
      return true;
    }
  }
  return false;
}
