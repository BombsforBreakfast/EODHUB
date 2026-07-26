"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, supabase } from "../lib/lib/supabaseClient";
import OptimizedAvatarImg from "./OptimizedAvatarImg";
import type { LinkedAccountSummary } from "../lib/auth/linkedAccountLabels";
import { switchToLinkedAccount } from "../lib/auth/switchLinkedAccountClient";
import { useTheme } from "../lib/ThemeContext";

type Props = {
  /** `chips` = own-profile row; `menu` = nav avatar dropdown. */
  variant?: "chips" | "menu";
  open?: boolean;
  onClose?: () => void;
};

export default function AccountSwitcherMenu({
  variant = "chips",
  open = true,
  onClose,
}: Props) {
  const { t, isDark } = useTheme();
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
    if (!open) return;
    void loadAccounts();
  }, [open, loadAccounts]);

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
  const accountInitial = (account: LinkedAccountSummary) =>
    account.label.replace(/^[^·]*·\s*/, "").trim().charAt(0).toUpperCase() || "?";
  const accountShortName = (account: LinkedAccountSummary) =>
    account.label.replace(/^(Business|Personal|Employer|Member)\s·\s/, "");

  if (variant === "chips") {
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
                    accountInitial(account)
                  )}
                </span>
                <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>
                    {busy ? "Switching…" : account.kind === "business" ? "Business" : "Personal"}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: t.textMuted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {accountShortName(account)}
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

  if (!open) return null;

  const current = accounts.find((a) => a.isCurrent);

  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: 0,
        minWidth: 260,
        maxWidth: 320,
        zIndex: 1400,
        background: t.surface,
        color: t.text,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        boxShadow: isDark ? "0 8px 28px rgba(0,0,0,0.45)" : "0 8px 28px rgba(0,0,0,0.18)",
        padding: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, padding: "6px 8px 8px" }}>
        Your accounts
      </div>
      {loading && (
        <div style={{ fontSize: 13, color: t.textFaint, padding: "8px" }}>Loading…</div>
      )}
      {!loading && accounts.length === 0 && (
        <div style={{ fontSize: 13, color: t.textFaint, padding: "8px" }}>No linked accounts</div>
      )}
      {accounts.map((account) => {
        const busy = switchingId === account.userId;
        return (
          <button
            key={account.userId}
            type="button"
            role="menuitem"
            disabled={account.isCurrent || !!switchingId}
            onClick={() => {
              if (account.isCurrent) {
                onClose?.();
                return;
              }
              void handleSwitch(account.userId);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left",
              border: "none",
              background: account.isCurrent ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)") : "transparent",
              borderRadius: 8,
              padding: "8px",
              cursor: account.isCurrent ? "default" : switchingId ? "wait" : "pointer",
              color: t.text,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: account.kind === "business" ? 8 : "50%",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: t.bg,
                flexShrink: 0,
                fontWeight: 800,
                border: account.isCurrent ? `2px solid ${t.text}` : `1px solid ${t.border}`,
              }}
            >
              {account.photoUrl ? (
                <OptimizedAvatarImg
                  photoUrl={account.photoUrl}
                  displayName={account.label}
                  sizePx={40}
                />
              ) : (
                accountInitial(account)
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>
                {account.label}
                {account.isCurrent ? " ✓" : ""}
              </span>
              <span style={{ display: "block", fontSize: 11, color: t.textMuted }}>
                {busy ? "Switching…" : account.subtitle || (account.isCurrent ? "Current" : "Tap to switch")}
              </span>
            </span>
          </button>
        );
      })}
      {error ? (
        <div style={{ fontSize: 12, color: "#b91c1c", padding: "6px 8px" }}>{error}</div>
      ) : null}
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 6, paddingTop: 6 }}>
        <a
          href={current?.userId ? `/profile/${current.userId}` : "/profile"}
          onClick={() => onClose?.()}
          style={{
            display: "block",
            padding: "8px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            color: t.text,
            textDecoration: "none",
          }}
        >
          View profile
        </a>
      </div>
    </div>
  );
}
