"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { RENDER_SAFE_ACTIONS, getActionDescription, getActionLabel } from "./renderSafeActions";
import { getMarkBypassDisabledReason, isMarkBypassDisabled } from "./renderSafeEncounterLogic";
import type { RenderSafeActionId, RenderSafeEncounter } from "./renderSafeTypes";

interface Props {
  encounter: RenderSafeEncounter;
  options: RenderSafeActionId[];
  onAction: (actionId: RenderSafeActionId) => void;
  finalRoomTimer?: number | null;
  onClose?: () => void;
}

export function RenderSafeEncounterModal({
  encounter,
  options,
  onAction,
  finalRoomTimer = null,
}: Props) {
  const { t } = useTheme();
  const isFinalRoom = encounter.type === "final_room";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: isFinalRoom ? "2px solid rgba(239,68,68,0.55)" : `1px solid ${t.border}`,
          background: t.surface,
          padding: "20px 18px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: isFinalRoom ? "0 0 24px rgba(239,68,68,0.15)" : undefined,
        }}
      >
        {encounter.roomTitle && (
          <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, letterSpacing: 1 }}>
            {encounter.roomTitle.toUpperCase()}
          </div>
        )}
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: 1, marginTop: encounter.roomTitle ? 4 : 0 }}>
          ENCOUNTER
        </div>
        <h3 style={{ margin: "6px 0 4px", fontSize: 18 }}>{encounter.label}</h3>
        {isFinalRoom && finalRoomTimer != null && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.4)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, letterSpacing: 1 }}>
              THREAT CONFIRMED
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#ef4444", fontFamily: "monospace" }}>
              0:{Math.max(0, finalRoomTimer).toString().padStart(2, "0")}
            </div>
          </div>
        )}
        {encounter.concealThreatUntilInvestigated && encounter.roomTitle && (
          <p style={{ fontSize: 13, color: t.text, lineHeight: 1.5, marginBottom: 8 }}>
            You entered {encounter.roomTitle}. The interior is now visible.
          </p>
        )}
        <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.5, marginBottom: 18 }}>
          {encounter.cue}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((actionId, index) => {
            const action = RENDER_SAFE_ACTIONS[actionId];
            const disabled =
              actionId === "mark_bypass" && isMarkBypassDisabled(encounter);
            const disabledReason =
              actionId === "mark_bypass" ? getMarkBypassDisabledReason(encounter) : null;
            const label = getActionLabel(actionId, encounter);
            const description = getActionDescription(actionId, encounter);

            return (
              <button
                key={actionId}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onAction(actionId)}
                style={{
                  textAlign: "left",
                  padding: "14px 14px",
                  borderRadius: 10,
                  border: `1px solid ${disabled ? t.borderLight : actionId === "call_avalanche" ? "rgba(34,197,94,0.45)" : t.border}`,
                  background: disabled ? t.bg : actionId === "call_avalanche" ? "rgba(34,197,94,0.08)" : t.surfaceHover,
                  color: disabled ? t.textFaint : t.text,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {label}
                  {index < 9 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: t.textMuted }}>
                      [{index + 1}]
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                  {disabled && disabledReason ? disabledReason : description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
