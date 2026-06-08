"use client";

import { useEffect, type RefObject } from "react";
import { GAME_PLAYING_BODY_CLASS } from "./useGamePlayingBodyClass";

function isMobilePlaySurface(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px), (max-height: 500px), (pointer: coarse)").matches;
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** User-gesture friendly fullscreen entry (landscape mobile). */
export async function tryGameFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el) return false;
  const target = el as FullscreenElement;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
      return true;
    }
    if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Blocked without gesture or unsupported on this browser.
  }
  return false;
}

async function exitElementFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  try {
    if (doc.fullscreenElement && doc.exitFullscreen) {
      await doc.exitFullscreen();
      return;
    }
    if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // ignore
  }
}

/**
 * Mobile arcade immersion: lock page scroll, track the visible viewport (browser chrome),
 * and request fullscreen in landscape so tab/URL bars collapse when supported.
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

    const mobile = isMobilePlaySurface();
    let cancelled = false;

    const collapseBrowserChrome = () => {
      if (!mobile) return;
      // Nudge mobile browsers to hide the address/tab bar after rotation.
      window.scrollTo(0, 1);
      window.requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    };

    const syncVisualViewport = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      html.style.setProperty("--game-visible-height", `${vv.height}px`);
      html.style.setProperty("--game-visible-top", `${vv.offsetTop}px`);
      html.style.setProperty("--game-visible-left", `${vv.offsetLeft}px`);
      html.style.setProperty("--game-visible-width", `${vv.width}px`);
      collapseBrowserChrome();
    };

    const tryImmersive = () => {
      if (!mobile || cancelled) return;
      syncVisualViewport();
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      if (!landscape) return;
      void tryGameFullscreen(shellRef?.current ?? document.documentElement);
    };

    syncVisualViewport();
    tryImmersive();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncVisualViewport);
    vv?.addEventListener("scroll", syncVisualViewport);
    window.addEventListener("resize", syncVisualViewport);
    window.addEventListener("orientationchange", tryImmersive);

    const retryTimers = [120, 350, 900].map((ms) =>
      window.setTimeout(() => {
        if (!cancelled) tryImmersive();
      }, ms),
    );

    return () => {
      cancelled = true;
      for (const id of retryTimers) window.clearTimeout(id);
      vv?.removeEventListener("resize", syncVisualViewport);
      vv?.removeEventListener("scroll", syncVisualViewport);
      window.removeEventListener("resize", syncVisualViewport);
      window.removeEventListener("orientationchange", tryImmersive);
      html.classList.remove(GAME_PLAYING_BODY_CLASS);
      document.body.classList.remove(GAME_PLAYING_BODY_CLASS);
      html.style.removeProperty("--game-visible-height");
      html.style.removeProperty("--game-visible-top");
      html.style.removeProperty("--game-visible-left");
      html.style.removeProperty("--game-visible-width");
      void exitElementFullscreen();
    };
  }, [active, shellRef]);
}
