"use client";

import { LikerAvatar } from "@/app/components/PostLikersStack";
import { useTheme } from "@/app/lib/ThemeContext";
import type { ArcadeWallet } from "./arcadeWalletStorage";

type ViewerProfileMini = {
  displayName: string;
  photoUrl: string | null;
  service: string | null;
  isEmployer: boolean | null;
};

export function ArcadeSessionBar({
  profile,
  wallet,
  walletLoading,
}: {
  profile: ViewerProfileMini | null;
  wallet: ArcadeWallet | null;
  walletLoading?: boolean;
}) {
  const { t, isDark } = useTheme();
  const dailyMax = wallet?.dailyMax ?? 10;
  const balance = wallet?.balance ?? (walletLoading ? null : 0);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.surface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {profile ? (
          <>
            <LikerAvatar
              photoUrl={profile.photoUrl}
              name={profile.displayName}
              service={profile.service}
              isEmployer={profile.isEmployer}
              size={40}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Player
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: t.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {profile.displayName}
              </div>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: t.textMuted }}>Loading profile…</div>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          textAlign: "right",
          padding: "6px 10px",
          borderRadius: 10,
          background: isDark ? "rgba(201,162,39,0.12)" : "rgba(201,162,39,0.14)",
          border: `1px solid ${isDark ? "rgba(201,162,39,0.35)" : "rgba(201,162,39,0.45)"}`,
        }}
        aria-label="Challenge coins remaining"
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: "#a16207", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Challenge Coins
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#92400e", lineHeight: 1.2, marginTop: 2 }}>
          {balance == null ? "…" : `${balance}/${dailyMax}`}
        </div>
      </div>
    </div>
  );
}
