"use client";

import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import NavBar from "../NavBar";
import DesktopLayout from "../DesktopLayout";
import MemberPaywallModal from "../MemberPaywallModal";
import SidebarThreadDrawer from "../SidebarThreadDrawer";
import { supabase } from "../../lib/lib/supabaseClient";
import { memberHasInteractionAccess } from "../../lib/subscriptionAccess";
import { MasterShellProvider } from "./masterShellContext";
import { loadActiveProfile } from "../../lib/auth/activeProfile";

const MasterLeftColumn = dynamic(() => import("./MasterLeftColumn"), { ssr: true });
const MasterRightColumn = dynamic(() => import("./MasterRightColumn"), { ssr: true });

function getSavedRailState(key: string): "expanded" | "collapsed" {
  if (typeof window === "undefined") return "expanded";
  try {
    const saved = window.localStorage.getItem(key);
    return saved === "expanded" || saved === "collapsed" ? saved : "expanded";
  } catch {
    return "expanded";
  }
}

export default function MasterShell({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  // Must match server first paint: never read `window` / `localStorage` in useState initializers,
  // or wide viewports hydrate as desktop while SSR always emitted mobile shell → hydration mismatch.
  const [isDesktop, setIsDesktop] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [leftRailState, setLeftRailState] = useState<"expanded" | "collapsed">("expanded");
  const [rightRailState, setRightRailState] = useState<"expanded" | "collapsed">("expanded");
  const [memberPaywallOpen, setMemberPaywallOpen] = useState(false);
  const memberInteractionAllowedRef = useRef(true);
  const [sidebarDrawer, setSidebarDrawer] = useState<{ open: boolean; peerId: string | null }>({
    open: false,
    peerId: null,
  });
  /** Defer heavy side-rail Supabase work until after first paint / idle so center feed wins on cold load. */
  const [sideRailsReady, setSideRailsReady] = useState(false);
  const [showMemorialFeedCards, setShowMemorialFeedCards] = useState(true);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    function syncViewport() {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      if (desktop) {
        setLeftRailState(getSavedRailState("eod-master-rail-left"));
        setRightRailState(getSavedRailState("eod-master-rail-right"));
      }
    }
    syncViewport();
    mq.addEventListener("change", syncViewport);
    return () => mq.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadShellUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      const uid = user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!user) {
        setShowMemorialFeedCards(true);
        memberInteractionAllowedRef.current = false;
        return;
      }
      const { profile: profileCheck } = await loadActiveProfile<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
        account_type: string | null;
        subscription_status: string | null;
        is_admin: boolean | null;
        show_memorial_feed_cards: boolean | null;
      }>(supabase, user, {
        route: "app/components/master/MasterShell.tsx:loadShellUser",
        select: "user_id, email, display_name, first_name, last_name, photo_url, account_type, subscription_status, is_admin, show_memorial_feed_cards",
      });
      if (cancelled) return;
      if (!profileCheck) {
        setShowMemorialFeedCards(true);
        memberInteractionAllowedRef.current = false;
        return;
      }
      const p = profileCheck as { show_memorial_feed_cards?: boolean | null };
      setShowMemorialFeedCards(p.show_memorial_feed_cards !== false);
      memberInteractionAllowedRef.current = memberHasInteractionAccess({
        accountType: profileCheck.account_type,
        subscriptionStatus: profileCheck.subscription_status ?? null,
        authUserCreatedAtIso: user.created_at ?? null,
        isAdmin: profileCheck.is_admin,
      });
    }

    void loadShellUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void loadShellUser();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      const tid = window.setTimeout(() => {
        setSideRailsReady(false);
      }, 0);
      return () => {
        window.clearTimeout(tid);
      };
    }
    // Keep side rails from competing with initial feed paint on cold desktop loads.
    // We intentionally wait a bit (not just "idle") because idle can fire almost immediately.
    const resetTid = window.setTimeout(() => {
      setSideRailsReady(false);
    }, 0);
    const readyTid = window.setTimeout(() => {
      setSideRailsReady(true);
    }, 900);
    return () => {
      window.clearTimeout(resetTid);
      window.clearTimeout(readyTid);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    try {
      window.localStorage.setItem("eod-master-rail-left", leftRailState);
      window.localStorage.setItem("eod-master-rail-right", rightRailState);
    } catch {
      // Ignore localStorage write issues
    }
  }, [isDesktop, leftRailState, rightRailState]);

  const openSidebarPeer = useCallback((peerId: string) => {
    setSidebarDrawer({ open: true, peerId });
  }, []);

  const ctxValue = useMemo(
    () => ({
      isDesktopShell: isDesktop,
      openSidebarPeer: isDesktop ? openSidebarPeer : () => {},
      showMemorialFeedCards,
      setShowMemorialFeedCards,
    }),
    [isDesktop, openSidebarPeer, showMemorialFeedCards]
  );

  if (!isDesktop) {
    return (
      <MasterShellProvider value={ctxValue}>
        <div
          className="master-shell-mobile"
          style={{
            minHeight: "100vh",
            width: "100%",
            boxSizing: "border-box",
            background: t.bg,
            color: t.text,
          }}
        >
          <NavBar />
          {children}
        </div>
      </MasterShellProvider>
    );
  }

  return (
    <MasterShellProvider value={ctxValue}>
      <div
        className="master-shell-outer"
        style={{
          width: "100%",
          maxWidth: 1800,
          margin: "0 auto",
          padding: "16px 20px 24px",
          boxSizing: "border-box",
          background: t.bg,
          minHeight: "100vh",
          color: t.text,
        }}
      >
        <DesktopLayout
          isMobile={false}
          desktopColumns={`${leftRailState === "collapsed" ? "38px" : "320px"} minmax(0, 1fr) ${rightRailState === "collapsed" ? "38px" : "360px"}`}
          desktopGap={24}
          desktopMarginTop={0}
          left={
            <MasterLeftColumn
              userId={userId}
              memberInteractionAllowedRef={memberInteractionAllowedRef}
              onMemberPaywall={() => setMemberPaywallOpen(true)}
              railState={leftRailState}
              onToggleRail={() => setLeftRailState((prev) => (prev === "expanded" ? "collapsed" : "expanded"))}
              sideRailsReady={sideRailsReady}
            />
          }
          center={
            <main className="master-shell-main" style={{ minWidth: 0 }}>
              <NavBar />
              {children}
            </main>
          }
          right={
            <MasterRightColumn
              userId={userId}
              memberInteractionAllowedRef={memberInteractionAllowedRef}
              onMemberPaywall={() => setMemberPaywallOpen(true)}
              onOpenConversation={(peerId) => setSidebarDrawer({ open: true, peerId })}
              railState={rightRailState}
              onToggleRail={() => setRightRailState((prev) => (prev === "expanded" ? "collapsed" : "expanded"))}
              sideRailsReady={sideRailsReady}
            />
          }
        />
      </div>
      <MemberPaywallModal open={memberPaywallOpen} onClose={() => setMemberPaywallOpen(false)} />
      {userId ? (
        <SidebarThreadDrawer
          open={sidebarDrawer.open}
          onClose={() => setSidebarDrawer({ open: false, peerId: null })}
          currentUserId={userId}
          peerUserId={sidebarDrawer.peerId}
          modalOnDesktop
        />
      ) : null}
    </MasterShellProvider>
  );
}
