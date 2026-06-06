import type { RenderSafeAction, RenderSafeActionId } from "./renderSafeTypes";

export const RENDER_SAFE_ACTIONS: Record<RenderSafeActionId, RenderSafeAction> = {
  mark_bypass: {
    id: "mark_bypass",
    label: "Mark & Bypass",
    shortLabel: "Mark",
    hotkey: "1",
    description: "Mark the cue and route the force around it.",
  },
  investigate: {
    id: "investigate",
    label: "Investigate",
    shortLabel: "Investigate",
    hotkey: "2",
    description: "Use a fictional handheld detector check to gather more information.",
  },
  ignore: {
    id: "ignore",
    label: "Ignore",
    shortLabel: "Ignore",
    hotkey: "3",
    description: "Continue movement without action.",
  },
  remote_move: {
    id: "remote_move",
    label: "Remote Move",
    shortLabel: "Remote",
    hotkey: "1",
    description: "Mitigate the cue from standoff using a remote technique.",
  },
  bip: {
    id: "bip",
    label: "BIP",
    shortLabel: "BIP",
    hotkey: "2",
    description: "Dispose of the cue using a standoff disposal technique.",
  },
  hands_on: {
    id: "hands_on",
    label: "Hands-On",
    shortLabel: "Hands",
    hotkey: "3",
    description: "Close with the cue and work it by hand.",
  },
  cut_trip_line: {
    id: "cut_trip_line",
    label: "Cut Trip Line",
    shortLabel: "Cut",
    hotkey: "1",
    description: "Cut the trip line in place.",
  },
  trace_both_ends: {
    id: "trace_both_ends",
    label: "Trace Both Ends",
    shortLabel: "Trace",
    hotkey: "2",
    description: "Follow the line in both directions before acting.",
  },
  hook_rope_pull: {
    id: "hook_rope_pull",
    label: "Hook Rope & Pull",
    shortLabel: "Hook",
    hotkey: "3",
    description: "Hook the line and pull from standoff.",
  },
  cut_and_secure: {
    id: "cut_and_secure",
    label: "Cut Line & Secure Device",
    shortLabel: "Secure",
    hotkey: "1",
    description: "Cut the trip line and secure the fictional grenade pin.",
  },
} as const;

export const RENDER_SAFE_FEEDBACK = {
  correctMarkBypass:
    "Good call. You marked the cue with an orange chemlight and moved the force around it.",
  noThreatAfterInvestigation: "No threat detected. You kept the force moving.",
  benignCueMarked: "You marked a benign cue and used time, but the force stayed safe.",
  remoteMoveWhenBypassAvailable:
    "The hazard was mitigated, but the action compromised the assault. The target escaped.",
  bip: "The hazard was removed, but the blast compromised the raid. The target escaped.",
  handsOn: "You were killed. Don't be a hero, cowboy.",
  ignoreThreat: "The force moved past an unaddressed threat. Casualties occurred. Mission failed.",
  bridgeRemoteMove:
    "Good decision. No bypass was available, so you used a remote action and kept the mission moving.",
  decoyIgnored: "Benign route cue. Smart to keep moving.",
  decoyWastedTime: "Benign route cue. You burned time the assault force did not need.",
  markBypassDisabledReason: "Not available here.",
  investigationScanning: "Using HHD...",
  investigationNoThreat: "No threat detected. The cue appears benign.",
  investigationThreat: "Threat confirmed. Choose a follow-on action.",
  tripWireTraceResult:
    "One end is tied off to brush. The other runs loose to a fictional grenade pin.",
  tripWireCutAlone:
    "You cut the line without securing the pin. The device functioned. Mission failed.",
  tripWireHookPull:
    "You hooked the line and pulled. The assault was compromised. The target escaped.",
  tripWireSecureSuccess:
    "Good work. You traced the line, cut it, and secured the pin. The force keeps moving.",
} as const;
