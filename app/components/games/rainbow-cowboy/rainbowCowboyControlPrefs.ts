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

const OPACITY_BASE: Record<ArcadeControlOpacity, number> = {
  low: 0.5,
  medium: 0.62,
  high: 0.72,
};

export function getControlMetrics(prefs: RainbowCowboyControlPrefs) {
  const mult = SIZE_MULT[prefs.controlSize];
  const shortEdge =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth, window.innerHeight)
      : 390;
  const vmin = shortEdge / 100;

  return {
    opacityBase: OPACITY_BASE[prefs.buttonOpacity],
    opacityInactive: OPACITY_BASE[prefs.buttonOpacity] * 0.72,
    jump: Math.round(Math.min(110, Math.max(90, 10.5 * vmin * mult))),
    attack: Math.round(Math.min(95, Math.max(80, 9 * vmin * mult))),
    special: Math.round(Math.min(85, Math.max(70, 8 * vmin * mult))),
    gun: Math.round(Math.min(72, Math.max(58, 7 * vmin * mult))),
    joystickOuter: Math.round(Math.min(130, Math.max(110, 12.5 * vmin * mult))),
    joystickStick: Math.round(Math.min(52, Math.max(42, 5 * vmin * mult))),
    joystickPad: Math.round(Math.min(190, Math.max(160, 18 * vmin * mult))),
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
