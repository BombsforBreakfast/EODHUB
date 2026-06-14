"use client";

import { useEffect, useState } from "react";
import { buildNativeOAuthDeepLink } from "../../lib/native/nativeOAuthRedirect";
import { isNativeApp } from "../../lib/native/isNativeApp";

/**
 * OAuth browser-sheet bridge (Capacitor iOS/Android only).
 *
 * Supabase redirects here with ?code=… inside @capacitor/browser.
 * This page immediately hands off to com.eodhub.app://auth/callback so the
 * main WebView can run the server PKCE exchange at /auth/callback.
 */
export default function NativeOAuthAppCallbackPage() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    console.info("[auth/app-callback] bridge loaded", {
      search,
      hash,
      nativeShell: isNativeApp(),
    });

    // Already in the main WebView — exchange here (bridge sheet uses custom scheme).
    if (isNativeApp()) {
      void import("../../lib/native/completeNativeOAuthCallback").then(({ completeNativeOAuthFromDeepLink }) =>
        completeNativeOAuthFromDeepLink(window.location.href, async () => {}),
      );
      return;
    }

    const deepLink = buildNativeOAuthDeepLink(search, hash);
    console.info("[auth/app-callback] handing off to native scheme", deepLink);
    window.location.replace(deepLink);

    const timer = window.setTimeout(() => setStuck(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      {stuck ? (
        <p>
          Returning to EOD-Hub… If nothing happens, close this sheet and try again.
        </p>
      ) : (
        <p>Completing sign-in…</p>
      )}
    </div>
  );
}
