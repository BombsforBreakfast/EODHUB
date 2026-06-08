"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { RENDER_SAFE_FEEDBACK } from "./renderSafeActions";

interface Props {
  result: string | null;
  scanning: boolean;
  scanningLabel?: string;
}

export function RenderSafeInvestigationPanel({ result, scanning, scanningLabel }: Props) {
  const { t } = useTheme();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
          padding: "28px 22px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 8 }}>
          {scanning ? (scanningLabel ?? RENDER_SAFE_FEEDBACK.investigationScanning) : "Investigation Complete"}
        </div>
        {scanning ? (
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: t.border,
              overflow: "hidden",
              margin: "16px auto",
              maxWidth: 200,
            }}
          >
            <div
              style={{
                height: "100%",
                width: "40%",
                background: "#f97316",
                animation: "renderSafeScan 1.2s ease-in-out infinite",
              }}
            />
          </div>
        ) : (
          <p style={{ fontSize: 15, color: t.text, lineHeight: 1.5 }}>{result}</p>
        )}
      </div>
      <style>{`
        @keyframes renderSafeScan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
