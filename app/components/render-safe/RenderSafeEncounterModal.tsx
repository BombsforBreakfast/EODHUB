"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import { RENDER_SAFE_ACTIONS } from "./renderSafeActions";
import { getMarkBypassDisabledReason, isMarkBypassDisabled } from "./renderSafeEncounterLogic";
import type { RenderSafeActionId, RenderSafeEncounter } from "./renderSafeTypes";

interface Props {
  encounter: RenderSafeEncounter;
  options: RenderSafeActionId[];
  onAction: (actionId: RenderSafeActionId) => void;
  onClose?: () => void;
}

export function RenderSafeEncounterModal({ encounter, options, onAction }: Props) {
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
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          border: `1px solid ${t.border}`,
          background: t.surface,
          padding: "20px 18px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, letterSpacing: 1 }}>
          ENCOUNTER
        </div>
        <h3 style={{ margin: "6px 0 4px", fontSize: 18 }}>{encounter.label}</h3>
        <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.5, marginBottom: 18 }}>
          {encounter.cue}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((actionId) => {
            const action = RENDER_SAFE_ACTIONS[actionId];
            const disabled =
              actionId === "mark_bypass" && isMarkBypassDisabled(encounter);
            const disabledReason =
              actionId === "mark_bypass" ? getMarkBypassDisabledReason(encounter) : null;

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
                  border: `1px solid ${disabled ? t.borderLight : t.border}`,
                  background: disabled ? t.bg : t.surfaceHover,
                  color: disabled ? t.textFaint : t.text,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {action.label}
                  {action.hotkey && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: t.textMuted }}>
                      [{action.hotkey}]
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                  {disabled && disabledReason ? disabledReason : action.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
