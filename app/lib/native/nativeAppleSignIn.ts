"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  clearNativeOAuthCompleting,
  clearNativeOAuthInProgress,
  consumeOAuthRememberPending,
  markAppSessionActive,
  markNativeOAuthCompleting,
  markNativeOAuthInProgress,
} from "../auth/sessionState";
import { oauthDebugLog } from "../auth/oauthDebugLog";

const IOS_APP_CLIENT_ID = process.env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? "com.eodhub.app";
const APPLE_REDIRECT_URI =
  process.env.NEXT_PUBLIC_APPLE_NATIVE_REDIRECT_URI ?? "https://eod-hub.com/login";

type NativeAppleProfile = {
  email: string | null;
  fullName: string | null;
  appleUserId: string | null;
};

function randomNonce(length = 32): string {
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => charset[value % charset.length]).join("");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildFullName(givenName: string | null, familyName: string | null): string | null {
  const fullName = [givenName, familyName].filter(Boolean).join(" ").trim();
  return fullName || null;
}

async function syncSessionCookies(
  supabase: SupabaseClient,
  session: Session,
): Promise<boolean> {
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return !error && !!data.session?.user;
}

async function confirmServerSession(
  maxTries = 12,
  intervalMs = 250,
): Promise<{ ok: boolean; elapsedMs: number }> {
  const start = Date.now();
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    try {
      const res = await fetch("/api/auth/session-check", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { authenticated?: boolean };
        if (data.authenticated) return { ok: true, elapsedMs: Date.now() - start };
      }
    } catch {
      /* keep polling briefly while WKWebView commits Set-Cookie */
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return { ok: false, elapsedMs: Date.now() - start };
}

async function resolveNativeSessionDestination(
  session: Session,
  next: string,
): Promise<string> {
  try {
    const res = await fetch("/api/auth/oauth-native-complete", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ next, refresh_token: session.refresh_token }),
    });
    if (res.ok) {
      const data = (await res.json()) as { destination?: string };
      if (typeof data.destination === "string") return data.destination;
    }
  } catch {
    oauthDebugLog("native_apple_destination_api_failed", { next });
  }
  return next;
}

async function updateAppleProfileMetadata(
  supabase: SupabaseClient,
  profile: NativeAppleProfile,
) {
  const metadata: Record<string, string> = {};
  if (profile.email) metadata.apple_email = profile.email;
  if (profile.fullName) metadata.full_name = profile.fullName;
  if (profile.appleUserId) metadata.apple_user_id = profile.appleUserId;
  if (Object.keys(metadata).length === 0) return;

  const { error } = await supabase.auth.updateUser({ data: metadata });
  if (error) oauthDebugLog("native_apple_metadata_update_failed", { message: error.message });
}

async function completeNativeAppleSession(
  supabase: SupabaseClient,
  session: Session,
  nextPath: string,
) {
  markNativeOAuthCompleting();
  clearNativeOAuthInProgress();

  const synced = await syncSessionCookies(supabase, session);
  oauthDebugLog("native_apple_session_synced", { synced });

  const destination = await resolveNativeSessionDestination(session, nextPath);
  const confirmed = await confirmServerSession();
  oauthDebugLog("native_apple_navigate", {
    destination,
    sessionConfirmed: confirmed.ok,
    confirmMs: confirmed.elapsedMs,
  });

  window.location.assign(destination);
}

export async function signInWithNativeApple(
  supabase: SupabaseClient,
  nextPath = "/onboarding",
) {
  markNativeOAuthInProgress();

  try {
    const [{ SignInWithApple }] = await Promise.all([
      import("@capacitor-community/apple-sign-in"),
    ]);
    const rawNonce = randomNonce();
    const hashedNonce = await sha256(rawNonce);

    oauthDebugLog("native_apple_start", { nextPath, clientId: IOS_APP_CLIENT_ID });
    const result = await SignInWithApple.authorize({
      clientId: IOS_APP_CLIENT_ID,
      redirectURI: APPLE_REDIRECT_URI,
      scopes: "email name",
      state: crypto.randomUUID(),
      nonce: hashedNonce,
    });

    const { identityToken, email, givenName, familyName, user } = result.response;
    const fullName = buildFullName(givenName, familyName);
    oauthDebugLog("native_apple_authorized", {
      hasIdentityToken: !!identityToken,
      hasEmail: !!email,
      hasFullName: !!fullName,
    });

    const authResult = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: identityToken,
      nonce: rawNonce,
    });

    if (authResult.error || !authResult.data.session) {
      oauthDebugLog("native_apple_id_token_failed", {
        message: authResult.error?.message ?? "missing session",
      });
      clearNativeOAuthInProgress();
      clearNativeOAuthCompleting();
      return authResult;
    }

    const pendingRemember = consumeOAuthRememberPending();
    markAppSessionActive(pendingRemember ?? true);
    await updateAppleProfileMetadata(supabase, {
      email,
      fullName,
      appleUserId: user,
    });
    await completeNativeAppleSession(supabase, authResult.data.session, nextPath);
    return authResult;
  } catch (error) {
    clearNativeOAuthInProgress();
    clearNativeOAuthCompleting();
    oauthDebugLog("native_apple_error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      data: { user: null, session: null },
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
