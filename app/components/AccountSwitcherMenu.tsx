"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, supabase } from "../lib/lib/supabaseClient";
import OptimizedAvatarImg from "./OptimizedAvatarImg";
import type { LinkedAccountSummary } from "../lib/auth/linkedAccountLabels";
import { switchToLinkedAccount } from "../lib/auth/switchLinkedAccountClient";
import { useTheme } from "../lib/ThemeContext";

/** Compact row of switchable avatars on your own profile only. */
export default function AccountSwitcherMenu() {
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const [accounts, setAccounts] = useState<LinkedAccountSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken({ source: "accountSwitcher" });
      if (!token) {
        setAccounts([]);
        return;
      }
      const res = await fetch("/api/linked-auth-accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setAccounts([]);
        return;
      }
      const data = (await res.json()) as { accounts?: LinkedAccountSummary[] };
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function handleSwitch(targetUserId: string) {
    if (switchingId) return;
    setSwitchingId(targetUserId);
    setError(null);
    const result = await switchToLinkedAccount({
      supabase,
      targetUserId,
      queryClient,
      redirectTo: `/profile/${encodeURIComponent(targetUserId)}`,
    });
    if (!result.ok) {
      setError(result.error);
      setSwitchingId(null);
    }
  }

  const switchable = accounts.filter((a) => !a.isCurrent);
  if (!loading && switchable.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
        Switch account
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {loading && (
          <span style={{ fontSize: 12, color: t.textFaint }}>Loading…</span>
        )}
        {switchable.map((account) => {
          const initial = account.label.replace(/^[^·]*·\s*/, "").trim().charAt(0).toUpperCase() || "?";
          const busy = switchingId === account.userId;
          return (
            <button
              key={account.userId}
              type="button"
              disabled={!!switchingId}
              onClick={() => void handleSwitch(account.userId)}
              title={`Switch to ${account.label}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${account.kind === "business" ? "#d97706" : t.border}`,
                background: t.surface,
                borderRadius: 999,
                padding: "4px 10px 4px 4px",
                cursor: switchingId ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
                color: t.text,
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: account.kind === "business" ? 8 : "50%",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: t.bg,
                  flexShrink: 0,
                  fontWeight: 800,
                  fontSize: 14,
                  color: t.textMuted,
                }}
              >
                {account.photoUrl ? (
                  <OptimizedAvatarImg
                    photoUrl={account.photoUrl}
                    displayName={account.label}
                    sizePx={36}
                  />
                ) : (
                  initial
                )}
              </span>
              <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>
                  {busy ? "Switching…" : account.kind === "business" ? "Business" : "Personal"}
                </span>
                <span style={{ display: "block", fontSize: 11, color: t.textMuted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {account.label.replace(/^(Business|Personal|Employer|Member)\s·\s/, "")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{error}</div>
      ) : null}
    </div>
  );
}
