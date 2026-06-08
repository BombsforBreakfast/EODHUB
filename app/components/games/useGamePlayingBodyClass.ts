"use client";

import type { RefObject } from "react";
import { useMobileGameImmersiveMode } from "./useMobileGameImmersiveMode";

/** Applied to `html` + `body` while an arcade game session is active (mobile fullscreen + rotate prompt). */
export const GAME_PLAYING_BODY_CLASS = "game-playing-active";

/** @deprecated Prefer `useMobileGameImmersiveMode` for scroll lock + visual viewport sync. */
export function useGamePlayingBodyClass(active = true, shellRef?: RefObject<HTMLElement | null>) {
  useMobileGameImmersiveMode(active, shellRef);
}
