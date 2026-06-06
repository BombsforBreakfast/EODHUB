"use client";

interface Props {
  onMove: (dir: "up" | "down" | "left" | "right") => void;
  disabled?: boolean;
  overlay?: boolean;
}

export function RenderSafeControls({ onMove, disabled, overlay = true }: Props) {
  const btnStyle: React.CSSProperties = {
    width: "clamp(52px, 14vw, 64px)",
    height: "clamp(52px, 14vw, 64px)",
    borderRadius: 12,
    border: "2px solid rgba(249,115,22,0.45)",
    background: "rgba(8,12,8,0.82)",
    color: "#f0f0f0",
    fontSize: 22,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    userSelect: "none",
    backdropFilter: "blur(4px)",
  };

  const wrapperStyle: React.CSSProperties = overlay
    ? {
        position: "absolute",
        bottom: 12,
        right: 12,
        zIndex: 20,
        display: "grid",
        gridTemplateColumns: "repeat(3, auto)",
        gridTemplateRows: "repeat(2, auto)",
        gap: 6,
      }
    : {
        display: "grid",
        gridTemplateColumns: "repeat(3, auto)",
        gridTemplateRows: "repeat(2, auto)",
        gap: 6,
        justifyContent: "center",
        marginTop: 10,
      };

  return (
    <div style={wrapperStyle}>
      <div />
      <button type="button" style={btnStyle} disabled={disabled} onClick={() => onMove("up")} aria-label="Move up">
        ▲
      </button>
      <div />
      <button type="button" style={btnStyle} disabled={disabled} onClick={() => onMove("left")} aria-label="Move left">
        ◀
      </button>
      <button type="button" style={btnStyle} disabled={disabled} onClick={() => onMove("down")} aria-label="Move down">
        ▼
      </button>
      <button type="button" style={btnStyle} disabled={disabled} onClick={() => onMove("right")} aria-label="Move right">
        ▶
      </button>
    </div>
  );
}
