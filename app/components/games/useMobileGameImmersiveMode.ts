"use client";

import { useEffect, type RefObject } from "react";
import { GAME_PLAYING_BODY_CLASS } from "./useGamePlayingBodyClass";
import {
  debounce,
  exitArcadeImmersiveMode,
  syncGameViewportCssVars,
} from "./arcadeImmersiveMode";

export {
  enterArcadeImmersiveMode,
  exitArcadeImmersiveMode,
  tryGameFullscreen,
} from "./arcadeImmersiveMode";

/**
 * Mobile browser arcade: lock page scroll and track visualViewport (iOS Safari chrome).
 * Does not request fullscreen — gameplay fits the visible browser viewport.
 */
export function useMobileGameImmersiveMode(active: boolean, _shellRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    html.classList.add(GAME_PLAYING_BODY_CLASS);
    document.body.classList.add(GAME_PLAYING_BODY_CLASS);

    let cancelled = false;

    const syncViewport = debounce(() => {
      if (cancelled) return;
      syncGameViewportCssVars(html);
    }, 80);

    syncGameViewportCssVars(html);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);

    return () => {
      cancelled = true;
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      html.classList.remove(GAME_PLAYING_BODY_CLASS);
      document.body.classList.remove(GAME_PLAYING_BODY_CLASS);
      void exitArcadeImmersiveMode();
    };
  }, [active]);
}
