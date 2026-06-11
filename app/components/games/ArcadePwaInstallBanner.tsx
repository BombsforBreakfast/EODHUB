"use client";

import { useEffect, useState } from "react";
import { shouldShowPwaInstallHint } from "./arcadeImmersiveMode";

type Props = {
  active?: boolean;
};

/** Non-blocking iOS Safari hint — true fullscreen requires Add to Home Screen. */
export function ArcadePwaInstallBanner({ active = true }: Props) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!active || dismissed) {
      setVisible(false);
      return;
    }
    setVisible(shouldShowPwaInstallHint());
  }, [active, dismissed]);

  if (!visible) return null;

  return (
    <div
      className="arcade-pwa-install-banner"
      role="status"
      style={{
        position: "absolute",
        top: "max(8px, env(safe-area-inset-top, 0px))",
        left: "max(8px, env(safe-area-inset-left, 0px))",
        right: "max(8px, env(safe-area-inset-right, 0px))",
        zIndex: 28,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255, 200, 120, 0.45)",
        background: "rgba(0, 0, 0, 0.72)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 1.4,
        pointerEvents: "auto",
        backdropFilter: "blur(6px)",
      }}
    >
      <span style={{ flex: 1 }}>
        For true fullscreen arcade mode, add <strong>EOD Hub</strong> to your Home Screen, then open
        the game from the icon.
      </span>
      <button
        type="button"
        aria-label="Dismiss install hint"
        onClick={() => setDismissed(true)}
        style={{
          flexShrink: 0,
          border: "none",
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          borderRadius: 6,
          width: 24,
          height: 24,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
