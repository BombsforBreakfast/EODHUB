"use client";

interface Props {
  onLeft: (active: boolean) => void;
  onRight: (active: boolean) => void;
  onJump: () => void;
  onTongue: () => void;
  onRainbow: () => void;
  disabled?: boolean;
}

const btnStyle: React.CSSProperties = {
  border: "3px solid rgba(255,255,255,0.35)",
  borderRadius: 14,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontFamily: "monospace",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  touchAction: "manipulation",
  userSelect: "none",
  WebkitUserSelect: "none",
};

export function RainbowCowboyControls({
  onLeft,
  onRight,
  onJump,
  onTongue,
  onRainbow,
  disabled,
}: Props) {
  return (
    <>
      <div
        className="rc-mobile-controls"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: "none",
          padding: "10px 12px 16px",
          gap: 10,
          pointerEvents: disabled ? "none" : "auto",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          <button
            type="button"
            style={{ ...btnStyle, flex: 1, minHeight: 56, fontSize: 22 }}
            onTouchStart={(e) => {
              e.preventDefault();
              onLeft(true);
            }}
            onTouchEnd={() => onLeft(false)}
            onMouseDown={() => onLeft(true)}
            onMouseUp={() => onLeft(false)}
            onMouseLeave={() => onLeft(false)}
          >
            ◀
          </button>
          <button
            type="button"
            style={{ ...btnStyle, flex: 1, minHeight: 56, fontSize: 22 }}
            onTouchStart={(e) => {
              e.preventDefault();
              onRight(true);
            }}
            onTouchEnd={() => onRight(false)}
            onMouseDown={() => onRight(true)}
            onMouseUp={() => onRight(false)}
            onMouseLeave={() => onRight(false)}
          >
            ▶
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={{ ...btnStyle, minWidth: 64, minHeight: 56 }} onClick={onJump}>
            JUMP
          </button>
          <button type="button" style={{ ...btnStyle, minWidth: 72, minHeight: 56 }} onClick={onTongue}>
            TONGUE
          </button>
          <button
            type="button"
            style={{ ...btnStyle, minWidth: 72, minHeight: 56, borderColor: "rgba(255,120,220,0.7)" }}
            onClick={onRainbow}
          >
            🌈
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px), (max-height: 500px) {
          .rc-mobile-controls { display: flex !important; flex-direction: column; }
        }
      `}</style>
    </>
  );
}
