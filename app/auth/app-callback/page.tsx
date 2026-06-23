"use client";

import { useEffect, useState } from "react";
import { oauthDebugLog } from "../../lib/auth/oauthDebugLog";
import { buildNativeOAuthDeepLink } from "../../lib/native/nativeOAuthRedirect";

/**
 * OAuth browser-sheet bridge (Capacitor iOS/Android only).
 *
 * Supabase redirects here with ?code=… inside @capacitor/browser.
 * Always hand off to com.eodhub.app://auth/callback — the main WebView runs
 * the server PKCE exchange at /auth/callback. Never exchange the code here:
 * the PKCE verifier lives in the main WebView and this sheet is a separate
 * browsing context (attempting exchange here fails and sends users to /login).
 */
export default function NativeOAuthAppCallbackPage() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const hasCode = new URLSearchParams(search).has("code");
    const hasHashTokens =
      hash.includes("access_token") || hash.includes("refresh_token");
    const hasError = new URLSearchParams(search).has("error");

    oauthDebugLog("bridge_loaded", {
      hasCode,
      hasHashTokens,
      hasError,
      searchLength: search.length,
      hashLength: hash.length,
    });

    const deepLink = buildNativeOAuthDeepLink(search, hash);
    oauthDebugLog("bridge_handoff", { deepLink: deepLink.split("?")[0] ?? deepLink });
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
