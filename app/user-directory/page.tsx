"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import UserDirectoryCard from "../components/userDirectory/UserDirectoryCard";
import { useMasterShell } from "../components/master/masterShellContext";
import { usePageTracking } from "../hooks/usePageTracking";
import { useRequireFullAccess } from "../hooks/useRequireFullAccess";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { PAGE_TRACKING } from "../lib/pageTrackingPaths";
import {
  compareMembersAlphabetically,
  memberMatchesFilters,
  PROFILE_SERVICE_OPTIONS,
  type ConnectionAction,
} from "../lib/userDirectory";
import {
  fetchUserDirectoryMembers,
  runConnectionAction as runDirectoryConnectionAction,
  USER_DIRECTORY_STALE_MS,
} from "../lib/queries/userDirectory";
import { queryKeys } from "../lib/queryKeys";

export default function UserDirectoryPage() {
  useRequireFullAccess("app/user-directory/page.tsx");
  usePageTracking(PAGE_TRACKING.userDirectory);
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const { openSidebarPeer, isDesktopShell } = useMasterShell();

  const [keyword, setKeyword] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewerLoaded, setViewerLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadViewer() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
      if (!cancelled) {
        setCurrentUserId(user?.id ?? null);
        setViewerLoaded(true);
      }
    }
    void loadViewer();
    return () => {
      cancelled = true;
    };
  }, []);

  const membersQuery = useQuery({
    queryKey: queryKeys.userDirectory(currentUserId),
    queryFn: () => fetchUserDirectoryMembers(supabase, currentUserId),
    staleTime: USER_DIRECTORY_STALE_MS,
    enabled: viewerLoaded,
  });
  const members = membersQuery.data ?? [];
  const loading = !viewerLoaded || membersQuery.isLoading;
  const loadError = membersQuery.error instanceof Error ? membersQuery.error.message : null;

  const filterActive = keyword.trim().length > 0 || serviceFilter !== "";

  const visibleMembers = useMemo(
    () =>
      members
        .filter((m) => memberMatchesFilters(m, keyword, serviceFilter))
        .sort(compareMembersAlphabetically),
    [members, keyword, serviceFilter],
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${t.inputBorder}`,
    background: t.input,
    color: t.text,
    boxSizing: "border-box",
  };

  const runConnectionAction = useCallback(
    async (targetUserId: string, action: ConnectionAction) => {
      if (!currentUserId) {
        window.location.href = "/login";
        return;
      }

      const member = members.find((m) => m.user_id === targetUserId);
      if (!member) return;

      setBusyUserId(targetUserId);

      try {
        await runDirectoryConnectionAction({
          queryClient,
          supabase,
          viewerId: currentUserId,
          targetUserId,
          action,
        });
      } catch (error) {
        alert(error instanceof Error ? error.message : "Action failed. Please try again.");
      } finally {
        setBusyUserId(null);
      }
    },
    [currentUserId, members, queryClient],
  );

  const messageMember = useCallback(
    (targetUserId: string) => {
      if (!currentUserId) {
        window.location.href = "/login";
        return;
      }
      if (isDesktopShell) {
        openSidebarPeer(targetUserId);
      } else {
        window.location.href = `/sidebar?with=${targetUserId}`;
      }
    },
    [currentUserId, isDesktopShell, openSidebarPeer],
  );

  const promptSignIn = useCallback(() => {
    window.location.href = "/login";
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "12px 10px 24px" : "16px 20px 32px" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: t.text, margin: "0 0 6px" }}>
          User Directory
        </h1>
        <p style={{ fontSize: 14, color: t.textMuted, margin: 0 }}>
          Browse verified EOD community members
        </p>
      </div>

      <div
        style={{
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          background: t.surface,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 220px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search by name"
            aria-label="Search members"
            style={inputStyle}
          />
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            aria-label="Filter by service"
            style={inputStyle}
          >
            <option value="">All services</option>
            {PROFILE_SERVICE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        {filterActive && !loading && (
          <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>
            Showing {visibleMembers.length} {visibleMembers.length === 1 ? "member" : "members"}
          </div>
        )}
      </div>

      {loading && <div style={{ fontSize: 14, color: t.textMuted }}>Loading members…</div>}

      {loadError && (
        <div style={{ color: "#dc2626", fontSize: 14, padding: "10px 0" }}>
          Failed to load directory: {loadError}
        </div>
      )}

      {!loading && !loadError && visibleMembers.length === 0 && (
        <div style={{ fontSize: 14, color: t.textMuted }}>
          {filterActive ? "No members match your filters." : "No verified members found."}
        </div>
      )}

      {!loading && !loadError && visibleMembers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleMembers.map((member) => (
            <UserDirectoryCard
              key={member.user_id}
              member={member}
              isLoggedIn={!!currentUserId}
              isMobile={isMobile}
              busy={busyUserId === member.user_id}
              onKnow={() => void runConnectionAction(member.user_id, "know")}
              onConfirmKnow={() => void runConnectionAction(member.user_id, "confirm")}
              onDenyKnow={() => void runConnectionAction(member.user_id, "deny")}
              onCancelKnow={() => void runConnectionAction(member.user_id, "cancel")}
              onMessage={() => messageMember(member.user_id)}
              onSignInPrompt={promptSignIn}
            />
          ))}
        </div>
      )}
    </div>
  );
}
