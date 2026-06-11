"use client";

import { useEffect, type RefObject } from "react";
import { GAME_PLAYING_BODY_CLASS } from "./useGamePlayingBodyClass";
import {
  collapseMobileBrowserChrome,
  debounce,
  enterArcadeImmersiveMode,
  exitArcadeImmersiveMode,
  isMobileArcadeSurface,
  syncGameViewportCssVars,
  tryGameFullscreen,
} from "./arcadeImmersiveMode";

export {
  enterArcadeImmersiveMode,
  exitArcadeImmersiveMode,
  tryGameFullscreen,
} from "./arcadeImmersiveMode";

/**
 * Mobile arcade immersion: lock page scroll, track visualViewport (iOS chrome),
 * and request fullscreen in landscape when supported.
 */
export function useMobileGameImmersiveMode(
  active: boolean,
  shellRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    html.classList.add(GAME_PLAYING_BODY_CLASS);
    document.body.classList.add(GAME_PLAYING_BODY_CLASS);

    const mobile = isMobileArcadeSurface();
    let cancelled = false;

    const syncViewport = debounce(() => {
      if (cancelled) return;
      syncGameViewportCssVars(html);
      collapseMobileBrowserChrome();
    }, 80);

    const tryImmersive = () => {
      if (!mobile || cancelled) return;
      syncViewport();
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      if (!landscape) return;
      void tryGameFullscreen(shellRef?.current ?? document.documentElement);
    };

    syncGameViewportCssVars(html);
    collapseMobileBrowserChrome();
    tryImmersive();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", tryImmersive);

    const retryTimers = [120, 350, 900, 1600].map((ms) =>
      window.setTimeout(() => {
        if (!cancelled) tryImmersive();
      }, ms),
    );

    return () => {
      cancelled = true;
      for (const id of retryTimers) window.clearTimeout(id);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", tryImmersive);
      html.classList.remove(GAME_PLAYING_BODY_CLASS);
      document.body.classList.remove(GAME_PLAYING_BODY_CLASS);
      void exitArcadeImmersiveMode();
    };
  }, [active, shellRef]);
}
