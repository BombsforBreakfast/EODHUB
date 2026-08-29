"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchViewerProfileCached } from "../../lib/queries/viewerProfile";
import { useTheme } from "../../lib/ThemeContext";
import NavBar from "../NavBar";
import DesktopLayout from "../DesktopLayout";
import MemberPaywallModal from "../MemberPaywallModal";
import SidebarThreadDrawer from "../SidebarThreadDrawer";
import { supabase } from "../../lib/lib/supabaseClient";
import { useAuth } from "../../lib/auth/AuthProvider";
import { isMemberPaywallExemptPath, isExemptFromMemberPaywall, shouldEnforceMemberPaywall } from "../../lib/paywallPaths";
import { memberHasInteractionAccess } from "../../lib/subscriptionAccess";
import { MasterShellProvider } from "./masterShellContext";
import {
  onboardingRedirectUrl,
  resolvePreAccessRedirectPath,
  shouldRedirectToOnboarding,
} from "../../lib/onboardingGate";
import { hasFullPlatformAccess } from "../../lib/verificationAccess";
import { ensureWelcomeSidebarOnce } from "../../lib/welcomeSidebarClient";
import { ensureCountryPromptOnce } from "../../lib/ensureCountryPromptClient";
import {
  PROFILE_COUNTRY_NEEDED_MESSAGE,
  PROFILE_COUNTRY_NEEDED_TITLE,
  profileCountryChallengeHref,
  viewerNeedsCountryPrompt,
} from "../../lib/membershipCountryPrompt";
import { PRODUCT_FEATURE_FLAGS } from "../../lib/productFeatureFlags";

const MasterLeftColumn = dynamic(() => import("./MasterLeftColumn"), { ssr: true });
const MasterRightColumn = dynamic(() => import("./MasterRightColumn"), { ssr: true });

/** Centered desktop feed cap. 680 * 1.3 ≈ 884. */
const DESKTOP_FEED_MAX_WIDTH = 884;

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
  const { t, isDark } = useTheme();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
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
  const [isBusinessOrgAccount, setIsBusinessOrgAccount] = useState(false);
  const [countryPromptHref, setCountryPromptHref] = useState<string | null>(null);

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
    function onViewerCountryUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string; country?: string | null }>).detail;
      if (!detail?.userId || detail.userId !== userId) return;
      const country = typeof detail.country === "string" ? detail.country.trim() : "";
      setCountryPromptHref(country ? null : profileCountryChallengeHref(detail.userId));
    }
    window.addEventListener("eod:viewer-country-updated", onViewerCountryUpdated as EventListener);
    return () => {
      window.removeEventListener("eod:viewer-country-updated", onViewerCountryUpdated as EventListener);
    };
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    async function loadShellUser() {
      const uid = user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      setIsBusinessOrgAccount(false);
      if (!user) {
        setShowMemorialFeedCards(true);
        setCountryPromptHref(null);
        memberInteractionAllowedRef.current = false;
        return;
      }
      const profileCheck = await fetchViewerProfileCached(queryClient, supabase, user);
      if (cancelled) return;
      if (shouldRedirectToOnboarding(profileCheck)) {
        window.location.replace(onboardingRedirectUrl(true));
        return;
      }
      if (!profileCheck) {
        setShowMemorialFeedCards(true);
        setCountryPromptHref(null);
        memberInteractionAllowedRef.current = false;
        return;
      }
      const isBusinessOrg = profileCheck.account_type === "business_org";
      setIsBusinessOrgAccount(isBusinessOrg);
      if (!hasFullPlatformAccess(profileCheck)) {
        window.location.replace(resolvePreAccessRedirectPath(profileCheck));
        return;
      }
      const p = profileCheck as { show_memorial_feed_cards?: boolean | null };
      setShowMemorialFeedCards(p.show_memorial_feed_cards !== false);
      const allowed = memberHasInteractionAccess({
        accountType: profileCheck.account_type,
        subscriptionStatus: profileCheck.subscription_status ?? null,
        authUserCreatedAtIso: user.created_at ?? null,
        isAdmin: profileCheck.is_admin,
      });
      memberInteractionAllowedRef.current = allowed;

      if (hasFullPlatformAccess(profileCheck) && !isBusinessOrg) {
        ensureWelcomeSidebarOnce(supabase);
      }

      if (viewerNeedsCountryPrompt(profileCheck)) {
        setCountryPromptHref(profileCountryChallengeHref(user.id));
        ensureCountryPromptOnce(supabase);
      } else {
        setCountryPromptHref(null);
      }

      if (
        shouldEnforceMemberPaywall() &&
        !allowed &&
        !isExemptFromMemberPaywall(profileCheck.account_type, profileCheck.is_admin) &&
        typeof window !== "undefined" &&
        !isMemberPaywallExemptPath(window.location.pathname)
      ) {
        window.location.replace("/subscribe");
      }
    }

    void loadShellUser();
    return () => {
      cancelled = true;
    };
  }, [authLoading, queryClient, user?.id]);

  useEffect(() => {
    const railsEnabled =
      PRODUCT_FEATURE_FLAGS.desktopLeftRailEnabled || PRODUCT_FEATURE_FLAGS.desktopRightRailEnabled;
    if (!isDesktop || !railsEnabled) {
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
      isBusinessOrgAccount,
    }),
    [isDesktop, openSidebarPeer, showMemorialFeedCards, isBusinessOrgAccount]
  );

  const countryPromptBanner = countryPromptHref ? (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        border: `1px solid ${isDark ? "#ca8a04" : "#b45309"}`,
        borderLeft: `4px solid ${isDark ? "#facc15" : "#d97706"}`,
        borderRadius: 12,
        background: isDark ? "#4a3f0f" : "#fef3c7",
        padding: "14px 16px",
        margin: isDesktop ? "0 0 14px" : "12px 12px 0",
        boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.35)" : "0 2px 8px rgba(180, 83, 9, 0.18)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: isDark ? "#fef9c3" : "#422006", marginBottom: 4 }}>
          {PROFILE_COUNTRY_NEEDED_TITLE}
        </div>
        <div style={{ fontSize: 14, color: isDark ? "#fde68a" : "#451a03", lineHeight: 1.5 }}>
          {PROFILE_COUNTRY_NEEDED_MESSAGE}
        </div>
      </div>
      <Link
        href={countryPromptHref}
        style={{
          flexShrink: 0,
          background: isDark ? "#292524" : "#422006",
          color: "#fef9c3",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          padding: "8px 14px",
          fontWeight: 700,
          fontSize: 13,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Add country
      </Link>
    </div>
  ) : null;

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
          {countryPromptBanner}
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
          desktopColumns={
            PRODUCT_FEATURE_FLAGS.desktopLeftRailEnabled && PRODUCT_FEATURE_FLAGS.desktopRightRailEnabled
              ? `${leftRailState === "collapsed" ? "38px" : "320px"} minmax(0, 1fr) ${rightRailState === "collapsed" ? "38px" : "360px"}`
              : PRODUCT_FEATURE_FLAGS.desktopLeftRailEnabled
                ? `${leftRailState === "collapsed" ? "38px" : "320px"} minmax(0, 1fr)`
                : PRODUCT_FEATURE_FLAGS.desktopRightRailEnabled
                  ? `minmax(0, 1fr) ${rightRailState === "collapsed" ? "38px" : "360px"}`
                  : "minmax(0, 1fr)"
          }
          desktopJustifyContent="start"
          desktopMaxWidth={
            !PRODUCT_FEATURE_FLAGS.desktopLeftRailEnabled && !PRODUCT_FEATURE_FLAGS.desktopRightRailEnabled
              ? DESKTOP_FEED_MAX_WIDTH
              : !PRODUCT_FEATURE_FLAGS.desktopLeftRailEnabled && PRODUCT_FEATURE_FLAGS.desktopRightRailEnabled
                ? DESKTOP_FEED_MAX_WIDTH + 24 + (rightRailState === "collapsed" ? 38 : 360)
                : undefined
          }
          desktopGap={24}
          desktopMarginTop={0}
          left={
            PRODUCT_FEATURE_FLAGS.desktopLeftRailEnabled ? (
              <MasterLeftColumn
                userId={userId}
                memberInteractionAllowedRef={memberInteractionAllowedRef}
                onMemberPaywall={() => setMemberPaywallOpen(true)}
                railState={leftRailState}
                onToggleRail={() => setLeftRailState((prev) => (prev === "expanded" ? "collapsed" : "expanded"))}
                sideRailsReady={sideRailsReady}
              />
            ) : null
          }
          center={
            <main className="master-shell-main" style={{ minWidth: 0 }}>
              <NavBar />
              {countryPromptBanner}
              {children}
            </main>
          }
          right={
            PRODUCT_FEATURE_FLAGS.desktopRightRailEnabled ? (
              <MasterRightColumn
                userId={userId}
                memberInteractionAllowedRef={memberInteractionAllowedRef}
                onMemberPaywall={() => setMemberPaywallOpen(true)}
                onOpenConversation={(peerId) => setSidebarDrawer({ open: true, peerId })}
                railState={rightRailState}
                onToggleRail={() => setRightRailState((prev) => (prev === "expanded" ? "collapsed" : "expanded"))}
                sideRailsReady={sideRailsReady}
              />
            ) : null
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
