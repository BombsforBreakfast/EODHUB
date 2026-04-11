"use client";

import Image from "next/image";
import { useTheme } from "../lib/ThemeContext";
import type { KangarooCourtVerdictRow } from "../lib/kangarooCourt";
import {
  JUDGE_DISPLAY_NAME,
  JUDGE_SUBTITLE,
  judgeAvatarSrc,
  stripVerdictBodyLeadingDuplicate,
} from "../lib/kangarooCourt";

export function KangarooCourtVerdictBanner({ verdict }: { verdict: KangarooCourtVerdictRow }) {
  const { t, isDark } = useTheme();
  const border = t.border;
  const surface = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const body = stripVerdictBodyLeadingDuplicate(verdict.body);

  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: 12,
        background: surface,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1px solid ${border}` }}>
          <Image src={judgeAvatarSrc()} alt="" width={40} height={40} style={{ objectFit: "cover", width: "100%", height: "100%" }} unoptimized />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{JUDGE_DISPLAY_NAME}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{JUDGE_SUBTITLE}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{body}</div>
        </div>
      </div>
    </div>
  );
}
