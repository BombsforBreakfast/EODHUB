/** Mobile arcade immersion: fullscreen, orientation lock, viewport sync, PWA detection. */

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type NavigatorStandalone = Navigator & { standalone?: boolean };

export function isMobileArcadeSurface(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px), (max-height: 500px), (pointer: coarse)").matches;
}

export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as NavigatorStandalone;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function shouldShowPwaInstallHint(): boolean {
  return isMobileArcadeSurface() && isIosDevice() && !isStandaloneMode();
}

export type GameViewportSize = {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
};

export function readGameViewportSize(): GameViewportSize {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, offsetTop: 0, offsetLeft: 0 };
  }
  const vv = window.visualViewport;
  if (vv) {
    return {
      width: vv.width,
      height: vv.height,
      offsetTop: vv.offsetTop,
      offsetLeft: vv.offsetLeft,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetTop: 0,
    offsetLeft: 0,
  };
}

export function syncGameViewportCssVars(el: HTMLElement = document.documentElement): GameViewportSize {
  const size = readGameViewportSize();
  el.style.setProperty("--game-visible-width", `${size.width}px`);
  el.style.setProperty("--game-visible-height", `${size.height}px`);
  el.style.setProperty("--game-visible-top", `${size.offsetTop}px`);
  el.style.setProperty("--game-visible-left", `${size.offsetLeft}px`);
  el.style.setProperty("--game-dvh", `${size.height}px`);
  return size;
}

export function clearGameViewportCssVars(el: HTMLElement = document.documentElement): void {
  for (const key of [
    "--game-visible-width",
    "--game-visible-height",
    "--game-visible-top",
    "--game-visible-left",
    "--game-dvh",
  ]) {
    el.style.removeProperty(key);
  }
}

export async function tryGameFullscreen(el: HTMLElement | null): Promise<boolean> {
  const target = (el ?? document.documentElement) as FullscreenElement;
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

export async function exitElementFullscreen(): Promise<void> {
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

export async function lockLandscapeOrientation(): Promise<boolean> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape" | "portrait" | "natural") => Promise<void>;
    };
    if (orientation?.lock) {
      await orientation.lock("landscape");
      return true;
    }
  } catch {
    // Unsupported on iOS Safari tabs and some Android browsers.
  }
  return false;
}

export async function unlockScreenOrientation(): Promise<void> {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // ignore
  }
}

/** Call from a user gesture (Start Game, Enter Arcade). */
export async function enterArcadeImmersiveMode(
  target: HTMLElement | null = document.documentElement,
): Promise<{ fullscreen: boolean; orientationLocked: boolean }> {
  syncGameViewportCssVars();
  const fullscreen = await tryGameFullscreen(target);
  const orientationLocked = await lockLandscapeOrientation();
  return { fullscreen, orientationLocked };
}

export async function exitArcadeImmersiveMode(): Promise<void> {
  await exitElementFullscreen();
  await unlockScreenOrientation();
  clearGameViewportCssVars();
}

export function collapseMobileBrowserChrome(): void {
  if (!isMobileArcadeSurface()) return;
  window.scrollTo(0, 1);
  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0);
  });
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
