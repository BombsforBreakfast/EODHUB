"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "../lib/native/isNativeApp";
import { isNativeOAuthCompleting, isNativeOAuthInProgress } from "../lib/auth/sessionState";
import { handleNativeDeepLink, isHandledOAuthDeepLink } from "../lib/native/completeNativeOAuthCallback";
import { oauthDebugLog } from "../lib/auth/oauthDebugLog";
import { deliverRestoredCameraFiles, handleCameraRestoredResult } from "../lib/native/pickFeedMedia";
import { getNotificationHref } from "../lib/notificationNavigation";
import { supabase } from "../lib/lib/supabaseClient";

let pushListenersRegistered = false;

const PRODUCTION_ORIGIN = "https://eod-hub.com";

function isEodHubHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "eod-hub.com" || host.endsWith(".eod-hub.com");
}

function recoverBlankWebView() {
  if (isNativeOAuthInProgress() || isNativeOAuthCompleting()) return;
  if (window.location.href === "about:blank") {
    window.location.replace(PRODUCTION_ORIGIN);
    return;
  }
  const root = document.getElementById("__next");
  if (root && root.childElementCount === 0) {
    window.location.replace(PRODUCTION_ORIGIN);
  }
}

/**
 * Boots Capacitor-only behavior: push registration, notification taps, OAuth deep links.
 * No-op on regular web browsers.
 */
export default function NativeShellBridge() {
  const router = useRouter();
  const registeredTokenRef = useRef<string | null>(null);
  const registeredPlatformRef = useRef<"ios" | "android">("ios");
  const lastAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    document.documentElement.classList.add("native-shell");
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      document.documentElement.classList.add("native-shell-ios");
    }

    let cancelled = false;

    async function bootNativeShell() {
      console.info("[NativeShellBridge] boot", {
        href: window.location.href,
        origin: window.location.origin,
      });

      const [
        { Capacitor },
        { App },
        { PushNotifications },
        { Browser },
        { SplashScreen },
      ] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/push-notifications"),
        import("@capacitor/browser"),
        import("@capacitor/splash-screen"),
      ]);

      if (cancelled) return;

      void SplashScreen.hide().catch(() => {});

      async function closeInAppBrowser() {
        try {
          await Browser.close();
        } catch {
          /* already closed */
        }
      }

      async function onNativeDeepLink(rawUrl: string) {
        await handleNativeDeepLink(rawUrl, {
          closeBrowser: closeInAppBrowser,
          clientRoute: (path) => {
            router.push(path);
          },
        });
      }

      App.addListener("appUrlOpen", (event) => {
        void onNativeDeepLink(event.url);
      });

      App.addListener("appRestoredResult", (event) => {
        void handleCameraRestoredResult(event).then((files) => {
          deliverRestoredCameraFiles(files);
        });
      });

      // getLaunchUrl() returns the same URL for the whole process lifetime, so a
      // cold-launch OAuth deep link would be re-processed on every WebView reload.
      // Skip it once the code has already been exchanged to avoid a reload loop;
      // warm-path callbacks still arrive via the appUrlOpen listener above.
      void App.getLaunchUrl().then((launch) => {
        if (!launch?.url) return;
        if (isHandledOAuthDeepLink(launch.url)) {
          oauthDebugLog("launch_url_oauth_skipped", {});
          return;
        }
        void onNativeDeepLink(launch.url);
      });

      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return;
        void closeInAppBrowser();
        if (!isNativeOAuthInProgress() && !isNativeOAuthCompleting()) {
          window.setTimeout(recoverBlankWebView, 150);
        }
      });

      Browser.addListener("browserFinished", () => {
        if (!isNativeOAuthInProgress() && !isNativeOAuthCompleting()) {
          window.setTimeout(recoverBlankWebView, 150);
        }
      });

      const openExternalUrl = async (url: string) => {
        await Browser.open({ url });
      };

      (window as Window & { openExternalUrl?: (url: string) => Promise<void> }).openExternalUrl =
        openExternalUrl;

      const originalWindowOpen = window.open.bind(window);
      window.open = (url?: string | URL, target?: string, features?: string) => {
        if (url) {
          try {
            const parsed = new URL(String(url), window.location.origin);
            if (isEodHubHost(parsed.hostname)) {
              window.location.assign(parsed.href);
              return null;
            }
          } catch {
            /* fall through */
          }
          if (!target || target === "_blank") {
            void openExternalUrl(String(url));
            return null;
          }
        }
        return originalWindowOpen(url, target, features);
      };

      document.addEventListener(
        "click",
        (event) => {
          const anchor = (event.target as Element | null)?.closest("a[target='_blank']");
          if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
          try {
            const parsed = new URL(anchor.href);
            if (isEodHubHost(parsed.hostname)) {
              event.preventDefault();
              window.location.assign(parsed.href);
            }
          } catch {
            /* ignore */
          }
        },
        true,
      );

      if (!Capacitor.isPluginAvailable("PushNotifications")) return;

      async function registerToken(token: string) {
        registeredTokenRef.current = token;
        registeredPlatformRef.current = Capacitor.getPlatform() === "android" ? "android" : "ios";
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        lastAccessTokenRef.current = session.access_token;

        const res = await fetch("/api/push/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token, platform: registeredPlatformRef.current }),
        });
        if (!res.ok) {
          console.warn("[NativeShellBridge] push token registration failed", res.status);
        }
      }

      if (!pushListenersRegistered) {
        pushListenersRegistered = true;

        PushNotifications.addListener("registration", (token) => {
          if (token.value) void registerToken(token.value);
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.warn("[NativeShellBridge] push registration error", err);
        });

        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const data = action.notification.data as Record<string, unknown> | undefined;
          const link = typeof data?.link === "string" ? data.link : null;
          if (link) {
            router.push(link);
            return;
          }
          const message = typeof action.notification.body === "string" ? action.notification.body : "";
          const href = getNotificationHref(
            { message, post_owner_id: null, link },
            { currentUserId: null, isAdmin: false },
          );
          router.push(href);
        });
      }

      const permission = await PushNotifications.requestPermissions();
      if (permission.receive === "granted") {
        await PushNotifications.register();
      }

      const { data: { session } } = await supabase.auth.getSession();
      lastAccessTokenRef.current = session?.access_token ?? null;
      if (session?.access_token && registeredTokenRef.current) {
        await registerToken(registeredTokenRef.current);
      }
    }

    void bootNativeShell();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && registeredTokenRef.current) {
        lastAccessTokenRef.current = session.access_token;
        void fetch("/api/push/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            token: registeredTokenRef.current,
            platform: registeredPlatformRef.current,
          }),
        });
      }
      if (!session && registeredTokenRef.current) {
        const token = registeredTokenRef.current;
        const accessToken = lastAccessTokenRef.current;
        lastAccessTokenRef.current = null;
        if (accessToken) {
          void fetch("/api/push/register", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token }),
          });
        }
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
