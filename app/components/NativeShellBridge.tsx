"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "../lib/native/isNativeApp";
import { getNotificationHref } from "../lib/notificationNavigation";
import { supabase } from "../lib/lib/supabaseClient";

let pushListenersRegistered = false;

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

      App.addListener("appUrlOpen", (event) => {
        try {
          const opened = new URL(event.url);
          if (opened.host.includes("eod-hub.com") || opened.pathname.startsWith("/auth/")) {
            const target = `${opened.pathname}${opened.search}${opened.hash}`;
            router.push(target || "/");
          }
        } catch {
          /* ignore malformed URLs */
        }
      });

      (window as Window & { openExternalUrl?: (url: string) => Promise<void> }).openExternalUrl =
        async (url: string) => {
          await Browser.open({ url });
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
