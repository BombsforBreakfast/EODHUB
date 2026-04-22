"use client";

import Image from "next/image";
import { useTheme } from "../lib/ThemeContext";

type Props = {
  size: number;
};

/**
 * Circular avatar used for pure-admin (EOD HUB staff) accounts.
 * Renders the EOD HUB crab logo on a neutral tile — never the user's initial
 * or a photo, since pure admins have no public profile.
 *
 * To customize: drop a square PNG at `public/branding/pure-admin-avatar.png`.
 * The component prefers that asset when present, falling back to the wordmark
 * crab logo.
 */
export default function PureAdminAvatar({ size }: Props) {
  const { t, isDark } = useTheme();
  return (
    <div
      aria-label="EOD HUB staff"
      title="EOD HUB"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: isDark ? "#000000" : t.bg,
        border: `1px solid ${t.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <Image
        src="/branding/pure-admin-avatar.png"
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (img.src.endsWith("/branding/pure-admin-avatar.png")) {
            img.src = "/branding/eod-crab-logo.png";
            img.style.mixBlendMode = isDark ? "normal" : "multiply";
            img.style.filter = isDark ? "invert(1) contrast(1.08)" : "none";
          }
        }}
        style={{
          width: "86%",
          height: "86%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}
