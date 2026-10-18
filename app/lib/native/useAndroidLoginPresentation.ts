"use client";

import { useEffect, useState } from "react";
import { isNativeAndroidApp } from "./isNativeApp";
import {
  ANDROID_OAUTH_STATE_EVENT,
  clearNativeOAuthInProgress,
  isNativeOAuthCompleting,
  isNativeOAuthInProgress,
} from "../auth/sessionState";

/** Presentation only: the existing callback still owns token exchange and navigation. */
export function useAndroidLoginPresentation() {
  // Wait for client platform detection so Apple never flashes on Android during hydration.
  const [showApple, setShowApple] = useState(false);
  const [finishingSignIn, setFinishingSignIn] = useState(false);

  useEffect(() => {
    const android = isNativeAndroidApp();
    setShowApple(!android);
    if (!android) return;

    let cancelled = false;
    let startedAt = 0;
    let returnTimer: ReturnType<typeof setTimeout> | undefined;
    let removeAppListener: (() => Promise<void>) | undefined;
    const sync = () => {
      const completing = isNativeOAuthCompleting();
      const pending = completing || isNativeOAuthInProgress();
      if (!pending) startedAt = 0;
      else if (!startedAt) startedAt = Date.now();
      // Abandoned provider tabs must not leave a permanent loading screen.
      if (pending && !completing && Date.now() - startedAt > 120_000) {
        clearNativeOAuthInProgress();
        return;
      }
      setFinishingSignIn(pending);
    };
    sync();
    window.addEventListener(ANDROID_OAUTH_STATE_EVENT, sync);
    const poll = window.setInterval(sync, 250);

    void import("@capacitor/app").then(async ({ App }) => {
      if (cancelled) return;
      const listener = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return;
        sync();
        if (returnTimer) clearTimeout(returnTimer);
        returnTimer = setTimeout(() => {
          // A callback marks completing before returning focus. Otherwise the
          // user simply closed the Google tab, so restore the usable login form.
          if (!isNativeOAuthCompleting()) clearNativeOAuthInProgress();
          sync();
        }, 1200);
      });
      if (cancelled) await listener.remove();
      else removeAppListener = () => listener.remove();
    }).catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener(ANDROID_OAUTH_STATE_EVENT, sync);
      window.clearInterval(poll);
      if (returnTimer) clearTimeout(returnTimer);
      void removeAppListener?.();
    };
  }, []);

  return { showApple, finishingSignIn };
}
