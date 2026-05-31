"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UserDirectoryCard from "../components/userDirectory/UserDirectoryCard";
import { useMasterShell } from "../components/master/masterShellContext";
import { usePageTracking } from "../hooks/usePageTracking";
import { useRequireFullAccess } from "../hooks/useRequireFullAccess";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { PAGE_TRACKING } from "../lib/pageTrackingPaths";
import {
  attachKnowStatus,
  buildKnowStatusMap,
  compareMembersAlphabetically,
  memberMatchesFilters,
  postConnectionAction,
  PROFILE_SERVICE_OPTIONS,
  RUMINT_USER_ID,
  type ConnectionAction,
  type KnowStatus,
  type UserDirectoryMember,
  type UserDirectoryProfileRow,
} from "../lib/userDirectory";

const PROFILE_COLUMNS =
  "user_id, first_name, last_name, display_name, photo_url, service, skill_badge";

export default function UserDirectoryPage() {
  useRequireFullAccess("app/user-directory/page.tsx");
  usePageTracking(PAGE_TRACKING.userDirectory);
  const { t } = useTheme();
  const { openSidebarPeer, isDesktopShell } = useMasterShell();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<UserDirectoryMember[]>([]);
  const [keyword, setKeyword] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const viewerId = user?.id ?? null;
    setCurrentUserId(viewerId);

    let profileQuery = supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("verification_status", "verified")
      .is("account_deleted_at", null)
      .neq("user_id", RUMINT_USER_ID)
      .not("first_name", "is", null)
      .order("last_name")
      .order("first_name")
      .limit(500);

    if (viewerId) {
      profileQuery = profileQuery.neq("user_id", viewerId);
    }

    const { data: profileRows, error: profileError } = await profileQuery;

    if (profileError) {
      setLoadError(profileError.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const profiles = (profileRows ?? []) as UserDirectoryProfileRow[];
    let knowStatusByUserId = new Map<string, KnowStatus>();

    if (viewerId) {
      const { data: connRows, error: connError } = await supabase
        .from("profile_connections")
        .select("requester_user_id, target_user_id, status")
        .or(`requester_user_id.eq.${viewerId},target_user_id.eq.${viewerId}`);

      if (connError) {
        setLoadError(connError.message);
        setMembers([]);
        setLoading(false);
        return;
      }

      knowStatusByUserId = buildKnowStatusMap(
        (connRows ?? []) as { requester_user_id: string; target_user_id: string; status: string }[],
        viewerId,
      );
    }

    setMembers(attachKnowStatus(profiles, knowStatusByUserId));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

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

  const updateKnowStatus = useCallback((targetUserId: string, knowStatus: KnowStatus) => {
    setMembers((prev) =>
      prev.map((m) => (m.user_id === targetUserId ? { ...m, knowStatus } : m)),
    );
  }, []);

  const runConnectionAction = useCallback(
    async (targetUserId: string, action: ConnectionAction) => {
      if (!currentUserId) {
        window.location.href = "/login";
        return;
      }

      const member = members.find((m) => m.user_id === targetUserId);
      if (!member) return;

      const prevStatus = member.knowStatus;
      let optimistic: KnowStatus = prevStatus;

      if (action === "know") {
        optimistic = prevStatus === "pending_incoming" ? "accepted" : "pending_outgoing";
      } else if (action === "confirm") {
        optimistic = "accepted";
      } else if (action === "deny" || action === "cancel") {
        optimistic = "none";
      }

      updateKnowStatus(targetUserId, optimistic);
      setBusyUserId(targetUserId);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          updateKnowStatus(targetUserId, prevStatus);
          alert("Please sign in again to continue.");
          return;
        }

        const result = await postConnectionAction(action, targetUserId, session.access_token);
        if (!result.ok) {
          updateKnowStatus(targetUserId, prevStatus);
          alert(result.error || "Action failed. Please try again.");
          return;
        }

        if (result.state) {
          updateKnowStatus(targetUserId, result.state);
        }
      } catch {
        updateKnowStatus(targetUserId, prevStatus);
        alert("Action failed. Please try again.");
      } finally {
        setBusyUserId(null);
      }
    },
    [currentUserId, members, updateKnowStatus],
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
