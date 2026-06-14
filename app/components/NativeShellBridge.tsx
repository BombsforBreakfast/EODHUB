"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "../lib/native/isNativeApp";
import { resolveNativeAppUrlOpenTarget } from "../lib/native/nativeOAuthRedirect";
import { getNotificationHref } from "../lib/notificationNavigation";
import { supabase } from "../lib/lib/supabaseClient";

let pushListenersRegistered = false;

const PRODUCTION_ORIGIN = "https://www.eod-hub.com";

function recoverBlankWebView() {
  if (window.location.href === "about:blank") {
    window.location.replace(PRODUCTION_ORIGIN);
    return;
  }
  const root = document.getElementById("__next");
  if (root && root.childElementCount === 0) {
    window.location.replace(window.location.origin + "/");
  }
}

/**
 * Boots Capacitor-only behavior: push registration, notification taps, OAuth deep links.
 * No-op on regular web browsers.
 */
export default function NativeShellBridge() {
  const router = useRouter();
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    document.documentElement.classList.add("native-shell");
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      document.documentElement.classList.add("native-shell-ios");
    }

    let cancelled = false;

    async function bootNativeShell() {
      const [
        { Capacitor },
        { App },
        { PushNotifications },
        { Browser },
      ] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/push-notifications"),
        import("@capacitor/browser"),
      ]);

      if (cancelled) return;

      async function closeInAppBrowser() {
        try {
          await Browser.close();
        } catch {
          /* already closed */
        }
      }

      App.addListener("appUrlOpen", (event) => {
        const target = resolveNativeAppUrlOpenTarget(event.url);
        if (!target) return;
        void closeInAppBrowser().then(() => {
          router.push(target);
        });
      });

      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) return;
        void closeInAppBrowser();
        window.setTimeout(recoverBlankWebView, 150);
      });

      Browser.addListener("browserFinished", () => {
        window.setTimeout(recoverBlankWebView, 150);
      });

      const openExternalUrl = async (url: string) => {
        await Browser.open({ url });
      };

      (window as Window & { openExternalUrl?: (url: string) => Promise<void> }).openExternalUrl =
        openExternalUrl;

      const originalWindowOpen = window.open.bind(window);
      window.open = (url?: string | URL, target?: string, features?: string) => {
        if (url && (!target || target === "_blank")) {
          void openExternalUrl(String(url));
          return null;
        }
        return originalWindowOpen(url, target, features);
      };

      if (!Capacitor.isPluginAvailable("PushNotifications")) return;

      async function registerToken(token: string) {
        if (registeredTokenRef.current === token) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch("/api/push/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
        });
        if (res.ok) registeredTokenRef.current = token;
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
      if (session?.access_token && registeredTokenRef.current) {
        await registerToken(registeredTokenRef.current);
      }
    }

    void bootNativeShell();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token && registeredTokenRef.current) {
        void fetch("/api/push/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            token: registeredTokenRef.current,
            platform: "ios",
          }),
        });
      }
      if (!session && registeredTokenRef.current) {
        registeredTokenRef.current = null;
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
