export type ArcadeControlSize = "small" | "medium" | "large";
export type ArcadeControlOpacity = "low" | "medium" | "high";

export type RainbowCowboyControlPrefs = {
  controlSize: ArcadeControlSize;
  buttonOpacity: ArcadeControlOpacity;
  hapticsEnabled: boolean;
};

export const DEFAULT_RAINBOW_COWBOY_CONTROL_PREFS: RainbowCowboyControlPrefs = {
  controlSize: "medium",
  buttonOpacity: "medium",
  hapticsEnabled: true,
};

const STORAGE_KEY = "rainbowCowboy_controlPrefs";

export function loadRainbowCowboyControlPrefs(): RainbowCowboyControlPrefs {
  if (typeof window === "undefined") return DEFAULT_RAINBOW_COWBOY_CONTROL_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RAINBOW_COWBOY_CONTROL_PREFS;
    const parsed = JSON.parse(raw) as Partial<RainbowCowboyControlPrefs>;
    return {
      controlSize:
        parsed.controlSize === "small" || parsed.controlSize === "large"
          ? parsed.controlSize
          : "medium",
      buttonOpacity:
        parsed.buttonOpacity === "low" || parsed.buttonOpacity === "high"
          ? parsed.buttonOpacity
          : "medium",
      hapticsEnabled: parsed.hapticsEnabled !== false,
    };
  } catch {
    return DEFAULT_RAINBOW_COWBOY_CONTROL_PREFS;
  }
}

export function saveRainbowCowboyControlPrefs(prefs: RainbowCowboyControlPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

const SIZE_MULT: Record<ArcadeControlSize, number> = {
  small: 0.88,
  medium: 1,
  large: 1.14,
};

const OPACITY_ACTIVE: Record<ArcadeControlOpacity, number> = {
  low: 0.65,
  medium: 0.7,
  high: 0.75,
};

const OPACITY_IDLE: Record<ArcadeControlOpacity, number> = {
  low: 0.35,
  medium: 0.4,
  high: 0.45,
};

function clampPx(min: number, vwPct: number, max: number, vw: number, mult: number): number {
  return Math.round(Math.min(max, Math.max(min, (vw * vwPct) / 100)) * mult);
}

export function getControlMetrics(prefs: RainbowCowboyControlPrefs) {
  const mult = SIZE_MULT[prefs.controlSize];
  const vw =
    typeof window !== "undefined"
      ? window.visualViewport?.width ?? window.innerWidth
      : 800;

  return {
    opacityBase: OPACITY_ACTIVE[prefs.buttonOpacity],
    opacityInactive: OPACITY_IDLE[prefs.buttonOpacity],
    jump: clampPx(76, 11, 104, vw, mult),
    attack: clampPx(68, 10, 96, vw, mult),
    special: clampPx(60, 9, 86, vw, mult),
    gun: clampPx(52, 8, 72, vw, mult),
    joystickOuter: clampPx(72, 10, 96, vw, mult),
    joystickStick: clampPx(28, 4, 38, vw, mult),
    joystickPad: clampPx(92, 13, 120, vw, mult),
  };
}

export function triggerControlHaptic(prefs: RainbowCowboyControlPrefs, strong = false): void {
  if (!prefs.hapticsEnabled || typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(strong ? 14 : 8);
  } catch {
    /* ignore */
  }
}
