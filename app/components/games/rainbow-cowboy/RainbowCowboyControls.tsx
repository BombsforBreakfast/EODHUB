"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onLeft: (active: boolean) => void;
  onRight: (active: boolean) => void;
  onDuck: (active: boolean) => void;
  onJump: () => void;
  onTongue: () => void;
  onGunDown?: () => void;
  onGunUp?: () => void;
  onRainbow: () => void;
  showGunButton?: boolean;
  disabled?: boolean;
}

const opaqueBtn: React.CSSProperties = {
  border: "2px solid rgba(255,255,255,0.45)",
  borderRadius: 12,
  background: "rgba(0,0,0,0.48)",
  color: "#fff",
  fontFamily: "monospace",
  fontWeight: 800,
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1.15,
  minWidth: 72,
  minHeight: 64,
  padding: "6px 10px",
};

function useTouchLayout(): { mobile: boolean | null; landscape: boolean } {
  const [state, setState] = useState<{ mobile: boolean | null; landscape: boolean }>({
    mobile: null,
    landscape: false,
  });

  useEffect(() => {
    const refresh = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
      const landscape = window.matchMedia("(orientation: landscape)").matches;
      setState({ mobile: coarse || narrow, landscape: narrow && landscape });
    };
    refresh();
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);

  return state;
}

function VirtualJoystick({
  disabled,
  onLeft,
  onRight,
  onDuck,
  onJump,
}: {
  disabled?: boolean;
  onLeft: (active: boolean) => void;
  onRight: (active: boolean) => void;
  onDuck: (active: boolean) => void;
  onJump: () => void;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const jumpArmedRef = useRef(true);
  const activePointerRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStick({ x: 0, y: 0 });
    onLeft(false);
    onRight(false);
    onDuck(false);
    jumpArmedRef.current = true;
    activePointerRef.current = null;
  }, [onLeft, onRight, onDuck]);

  const applyStick = useCallback(
    (dx: number, dy: number) => {
      const max = 44;
      const dist = Math.hypot(dx, dy);
      if (dist > max) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      setStick({ x: dx, y: dy });
      const thresh = 12;
      onLeft(dx < -thresh);
      onRight(dx > thresh);
      onDuck(dy > thresh);
      if (dy < -thresh) {
        if (jumpArmedRef.current) {
          onJump();
          jumpArmedRef.current = false;
        }
      } else {
        jumpArmedRef.current = true;
      }
    },
    [onLeft, onRight, onDuck, onJump],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    activePointerRef.current = e.pointerId;
    zoneRef.current?.setPointerCapture(e.pointerId);
    const rect = zoneRef.current!.getBoundingClientRect();
    applyStick(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    const rect = zoneRef.current!.getBoundingClientRect();
    applyStick(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (activePointerRef.current !== e.pointerId) return;
    reset();
  };

  return (
    <div
      ref={zoneRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        width: 112,
        height: 112,
        borderRadius: "50%",
        background: "rgba(0,0,0,0.42)",
        border: "2px solid rgba(255,255,255,0.35)",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 48,
          height: 48,
          marginLeft: -24 + stick.x,
          marginTop: -24 + stick.y,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.22)",
          border: "2px solid rgba(255,255,255,0.5)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function ActionButton({
  label,
  sub,
  accent,
  onClick,
  onPointerDown,
  onPointerUp,
  disabled,
}: {
  label: string;
  sub: string;
  accent?: string;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...opaqueBtn,
        borderColor: accent ?? "rgba(255,255,255,0.45)",
      }}
      onClick={onClick}
      onPointerDown={(e) => {
        e.preventDefault();
        onPointerDown?.();
      }}
      onPointerUp={() => onPointerUp?.()}
      onPointerLeave={() => onPointerUp?.()}
    >
      <span style={{ fontSize: 18 }}>{label}</span>
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 2 }}>{sub}</span>
    </button>
  );
}

export function RainbowCowboyControls({
  onLeft,
  onRight,
  onDuck,
  onJump,
  onTongue,
  onGunDown,
  onGunUp,
  onRainbow,
  showGunButton,
  disabled,
}: Props) {
  return (
    <>
      <div
        className="rc-landscape-controls"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          display: "none",
          pointerEvents: disabled ? "none" : "none",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 14,
            bottom: 14,
            pointerEvents: disabled ? "none" : "auto",
          }}
        >
          <VirtualJoystick
            disabled={disabled}
            onLeft={onLeft}
            onRight={onRight}
            onDuck={onDuck}
            onJump={onJump}
          />
        </div>
        <div
          style={{
            position: "absolute",
            right: 14,
            bottom: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: disabled ? "none" : "auto",
          }}
        >
          <ActionButton
            label="(A)"
            sub="Explosion"
            accent="rgba(255,120,220,0.75)"
            disabled={disabled}
            onClick={onRainbow}
          />
          <ActionButton
            label="(B)"
            sub="Slurp"
            accent="rgba(255,220,120,0.65)"
            disabled={disabled}
            onClick={onTongue}
          />
          {showGunButton && onGunDown && onGunUp && (
            <ActionButton
              label="(C)"
              sub="Fire"
              accent="rgba(128,240,255,0.75)"
              disabled={disabled}
              onPointerDown={onGunDown}
              onPointerUp={onGunUp}
            />
          )}
        </div>
      </div>

      <div
        className="rc-portrait-controls"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: "none",
          padding: "10px 12px 16px",
          gap: 10,
          flexDirection: "column",
          pointerEvents: disabled ? "none" : "auto",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          <button
            type="button"
            style={{ ...opaqueBtn, flex: 1, minHeight: 56, fontSize: 22 }}
            onTouchStart={(e) => {
              e.preventDefault();
              onLeft(true);
            }}
            onTouchEnd={() => onLeft(false)}
          >
            ◀
          </button>
          <button
            type="button"
            style={{ ...opaqueBtn, flex: 1, minHeight: 56, fontSize: 22 }}
            onTouchStart={(e) => {
              e.preventDefault();
              onRight(true);
            }}
            onTouchEnd={() => onRight(false)}
          >
            ▶
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={{ ...opaqueBtn, minWidth: 64, minHeight: 56 }} onClick={onJump}>
            JUMP
          </button>
          <button
            type="button"
            style={{ ...opaqueBtn, minWidth: 64, minHeight: 56 }}
            onTouchStart={(e) => {
              e.preventDefault();
              onDuck(true);
            }}
            onTouchEnd={() => onDuck(false)}
          >
            DUCK
          </button>
          <ActionButton label="(B)" sub="Slurp" disabled={disabled} onClick={onTongue} />
          {showGunButton && onGunDown && onGunUp && (
            <ActionButton
              label="(C)"
              sub="Fire"
              accent="rgba(128,240,255,0.75)"
              disabled={disabled}
              onPointerDown={onGunDown}
              onPointerUp={onGunUp}
            />
          )}
          <ActionButton
            label="(A)"
            sub="Explosion"
            accent="rgba(255,120,220,0.75)"
            disabled={disabled}
            onClick={onRainbow}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) and (orientation: landscape) {
          .rc-landscape-controls {
            display: block !important;
            pointer-events: auto !important;
          }
          .rc-portrait-controls { display: none !important; }
        }
        @media (max-width: 900px) and (orientation: portrait) {
          .rc-portrait-controls { display: flex !important; }
          .rc-landscape-controls { display: none !important; }
        }
        @media (max-height: 500px) and (orientation: landscape) {
          .rc-landscape-controls {
            display: block !important;
            pointer-events: auto !important;
          }
          .rc-portrait-controls { display: none !important; }
        }
      `}</style>
    </>
  );
}
