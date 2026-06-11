"use client";

import { useLayoutEffect, useState } from "react";

const PORTRAIT_BODY_CLASS = "game-portrait-active";

function isMobileGameSurface(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px), (max-height: 500px), (pointer: coarse)").matches;
}

/** True when the visible viewport is taller than wide (portrait), using visualViewport when available. */
export function isPortraitViewport(): boolean {
  if (typeof window === "undefined") return false;
  const vv = window.visualViewport;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  return height > width;
}

export function shouldShowRotatePrompt(): boolean {
  return isMobileGameSurface() && isPortraitViewport();
}

/**
 * Tracks portrait vs landscape for mobile arcade play.
 * Sets `game-portrait-active` on <html> while portrait so CSS can hide the game surface.
 */
export function usePortraitRotateGate(active: boolean): boolean {
  const [showPrompt, setShowPrompt] = useState(() =>
    active && typeof window !== "undefined" ? shouldShowRotatePrompt() : false,
  );

  useLayoutEffect(() => {
    if (!active) {
      setShowPrompt(false);
      document.documentElement.classList.remove(PORTRAIT_BODY_CLASS);
      return;
    }

    const sync = () => {
      const show = shouldShowRotatePrompt();
      setShowPrompt(show);
      document.documentElement.classList.toggle(PORTRAIT_BODY_CLASS, show);
    };

    sync();

    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      document.documentElement.classList.remove(PORTRAIT_BODY_CLASS);
    };
  }, [active]);

  return showPrompt;
}
