"use client";

import Image from "next/image";
import { useTheme } from "../lib/ThemeContext";
import { MURPHY_DISPLAY_NAME, MURPHY_SUBTITLE, murphyAvatarSrc } from "../lib/murphyRabbithole";

export function MurphyRabbitholeBanner() {
  const { t, isDark } = useTheme();
  const surface = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 12,
        background: surface,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            border: `1px solid ${t.border}`,
          }}
        >
          <Image
            src={murphyAvatarSrc()}
            alt="Murphy"
            width={40}
            height={40}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
            unoptimized
          />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{MURPHY_DISPLAY_NAME}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{MURPHY_SUBTITLE}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: t.text }}>
            This post has been filed to the Rabbithole.
          </div>
        </div>
      </div>
    </div>
  );
}
