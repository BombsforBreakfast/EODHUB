"use client";

import { useEffect } from "react";

/** Applied to `document.body` while an arcade game session is active (mobile fullscreen + rotate prompt). */
export const GAME_PLAYING_BODY_CLASS = "game-playing-active";

export function useGamePlayingBodyClass(active = true) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add(GAME_PLAYING_BODY_CLASS);
    return () => {
      document.body.classList.remove(GAME_PLAYING_BODY_CLASS);
    };
  }, [active]);
}
