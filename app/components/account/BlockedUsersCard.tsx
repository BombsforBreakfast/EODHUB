"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { unblockUser, type BlockedUserSummary } from "../../lib/userBlocks";

export default function BlockedUsersCard({ userId }: { userId: string }) {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const card: React.CSSProperties = useMemo(
    () => ({ border: `1px solid ${t.border}`, borderRadius: 16, padding: "18px 24px", background: t.surface }),
    [t.border, t.surface],
  );

  const loadBlockedUsers = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Please sign in again.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/user-blocks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      blockedUsers?: BlockedUserSummary[];
      error?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "Couldn't load blocked users.");
      setLoading(false);
      return;
    }

    setBlockedUsers(body.blockedUsers ?? []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadBlockedUsers();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadBlockedUsers, userId]);

  async function confirmUnblock(user: BlockedUserSummary) {
    const ok = window.confirm(
      "Unblock this user?\n\nYou may begin seeing this user's posts, comments, and messages again.",
    );
    if (!ok) return;

    setUnblockingId(user.blockedId);
    const result = await unblockUser(supabase, user.blockedId);
    setUnblockingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBlockedUsers((prev) => prev.filter((row) => row.blockedId !== user.blockedId));
    setError(null);
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>Privacy & Safety</div>
      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginTop: 4, marginBottom: 14 }}>
        Manage people you have hidden/blocked. Blocks only affect your EOD-HUB experience.
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: t.textFaint,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        Blocked Users
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: t.textMuted }}>Loading blocked users…</div>
      ) : blockedUsers.length === 0 ? (
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>
          You have not hidden/blocked anyone.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {blockedUsers.map((user) => (
            <div
              key={user.blockedId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 0",
                borderTop: `1px solid ${t.border}`,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 220px" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    display: "grid",
                    placeItems: "center",
                    color: t.textMuted,
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {user.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    user.displayName.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: t.text, overflowWrap: "anywhere" }}>
                    {user.displayName}
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    Blocked {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void confirmUnblock(user)}
                disabled={unblockingId === user.blockedId}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: t.surface,
                  color: t.text,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: unblockingId === user.blockedId ? "wait" : "pointer",
                  opacity: unblockingId === user.blockedId ? 0.7 : 1,
                }}
              >
                {unblockingId === user.blockedId ? "Unblocking…" : "Unblock"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
