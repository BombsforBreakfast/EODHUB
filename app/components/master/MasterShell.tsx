"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import NavBar from "../NavBar";
import DesktopLayout from "../DesktopLayout";
import MemberPaywallModal from "../MemberPaywallModal";
import SidebarThreadDrawer from "../SidebarThreadDrawer";
import { supabase } from "../../lib/lib/supabaseClient";
import { memberHasInteractionAccess } from "../../lib/subscriptionAccess";
import { MasterShellProvider } from "./masterShellContext";
import MasterLeftColumn from "./MasterLeftColumn";
import MasterRightColumn from "./MasterRightColumn";

export default function MasterShell({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  const [isDesktop, setIsDesktop] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberPaywallOpen, setMemberPaywallOpen] = useState(false);
  const memberInteractionAllowedRef = useRef(true);
  const [sidebarDrawer, setSidebarDrawer] = useState<{ open: boolean; peerId: string | null }>({
    open: false,
    peerId: null,
  });

  useEffect(() => {
    function check() {
      setIsDesktop(window.innerWidth > 900);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
    return <MasterShellProvider value={ctxValue}>{children}</MasterShellProvider>;
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
          desktopColumns="320px minmax(0, 1fr) 360px"
          desktopGap={24}
          desktopMarginTop={0}
          left={
            <MasterLeftColumn
              userId={userId}
              memberInteractionAllowedRef={memberInteractionAllowedRef}
              onMemberPaywall={() => setMemberPaywallOpen(true)}
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
