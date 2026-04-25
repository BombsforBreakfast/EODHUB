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

const MasterLeftColumn = dynamic(() => import("./MasterLeftColumn"), { ssr: true });
const MasterRightColumn = dynamic(() => import("./MasterRightColumn"), { ssr: true });

export default function MasterShell({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
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

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) return;
      const { data: profileCheck } = await supabase
        .from("profiles")
        .select("account_type, subscription_status, is_admin")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled || !profileCheck) return;
      memberInteractionAllowedRef.current = memberHasInteractionAccess({
        accountType: profileCheck.account_type,
        subscriptionStatus: profileCheck.subscription_status ?? null,
        authUserCreatedAtIso: data.user?.created_at ?? null,
        isAdmin: profileCheck.is_admin,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      setSideRailsReady(false);
      return;
    }
    // Keep side rails from competing with initial feed paint on cold desktop loads.
    // We intentionally wait a bit (not just "idle") because idle can fire almost immediately.
    setSideRailsReady(false);
    const tid = window.setTimeout(() => {
      setSideRailsReady(true);
    }, 900);
    return () => {
      window.clearTimeout(tid);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    try {
      const savedLeft = window.localStorage.getItem("eod-master-rail-left");
      const savedRight = window.localStorage.getItem("eod-master-rail-right");
      if (savedLeft === "expanded" || savedLeft === "collapsed") setLeftRailState(savedLeft);
      if (savedRight === "expanded" || savedRight === "collapsed") setRightRailState(savedRight);
    } catch {
      // Ignore localStorage read issues (private mode, blocked storage)
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
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
    }),
    [isDesktop, openSidebarPeer]
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
