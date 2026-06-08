"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RainbowCowboyInputActions } from "./rainbowCowboyGameInput";

interface Props {
  actions: RainbowCowboyInputActions;
  slurpLabel?: string;
  showWeaponButton?: boolean;
  disabled?: boolean;
}

function useMobileControls(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const narrow = window.matchMedia("(max-width: 900px), (max-height: 500px)").matches;
      setMobile(coarse || narrow);
    };
    refresh();
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);

  return mobile;
}

function VirtualJoystick({
  disabled,
  actions,
}: {
  disabled?: boolean;
  actions: RainbowCowboyInputActions;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStick({ x: 0, y: 0 });
    actions.releaseMovement();
    activePointerRef.current = null;
  }, [actions]);

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
      actions.setMoveLeft(dx < -thresh);
      actions.setMoveRight(dx > thresh);
      actions.setDuck(dy > thresh);
    },
    [actions],
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

  const onPointerEnd = (e: React.PointerEvent) => {
    if (activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    reset();
  };

  return (
    <div
      ref={zoneRef}
      className="rc-joystick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={reset}
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

function MobileActionButton({
  label,
  sub,
  size,
  accent,
  disabled,
  onPress,
  onPressStart,
  onPressEnd,
}: {
  label: string;
  sub?: string;
  size: number;
  accent?: string;
  disabled?: boolean;
  onPress?: () => void;
  onPressStart?: () => void;
  onPressEnd?: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const firedRef = useRef(false);

  const handleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    firedRef.current = false;
    onPressStart?.();
    if (onPress && !firedRef.current) {
      onPress();
      firedRef.current = true;
    }
  };

  const handleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPressed(false);
    onPressEnd?.();
    firedRef.current = false;
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className="rc-mobile-action-btn"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={(e) => {
        if (e.buttons === 0) {
          setPressed(false);
          onPressEnd?.();
          firedRef.current = false;
        }
      }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${accent ?? "rgba(255,255,255,0.45)"}`,
        background: pressed ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.48)",
        color: "#fff",
        fontFamily: "monospace",
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1.1,
        padding: 4,
        opacity: disabled ? 0.5 : 1,
        transform: pressed ? "scale(0.94)" : "scale(1)",
        transition: "transform 80ms ease, background 80ms ease",
      }}
    >
      <span style={{ fontSize: size >= 76 ? 13 : 11 }}>{label}</span>
      {sub ? (
        <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.82, marginTop: 2 }}>{sub}</span>
      ) : null}
    </button>
  );
}

function MobileActionCluster({
  actions,
  slurpLabel,
  showWeaponButton,
  disabled,
  compact,
}: {
  actions: RainbowCowboyInputActions;
  slurpLabel: string;
  showWeaponButton: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const jumpSize = compact ? 72 : 80;
  const actionSize = compact ? 56 : 64;

  return (
    <div
      className="rc-action-cluster"
      style={{
        display: "grid",
        gridTemplateColumns: `${jumpSize}px ${actionSize}px`,
        gridTemplateRows: `${actionSize}px ${jumpSize}px`,
        gap: compact ? 8 : 10,
        alignItems: "end",
        justifyItems: "center",
      }}
    >
      <div style={{ gridColumn: 1, gridRow: 1 }}>
        <MobileActionButton
          label={slurpLabel}
          sub="ATK"
          size={actionSize}
          accent="rgba(255,220,120,0.7)"
          disabled={disabled}
          onPress={actions.pressSlurp}
        />
      </div>
      <div style={{ gridColumn: 2, gridRow: 1 }}>
        <MobileActionButton
          label="SPEC"
          sub="BLAST"
          size={actionSize}
          accent="rgba(255,120,220,0.75)"
          disabled={disabled}
          onPress={actions.pressSpecial}
        />
      </div>
      <div style={{ gridColumn: 1, gridRow: 2 }}>
        <MobileActionButton
          label="JUMP"
          size={jumpSize}
          accent="rgba(180,255,180,0.75)"
          disabled={disabled}
          onPress={actions.pressJump}
        />
      </div>
      <div style={{ gridColumn: 2, gridRow: 2 }}>
        {showWeaponButton ? (
          <MobileActionButton
            label="GUN"
            sub="FIRE"
            size={actionSize}
            accent="rgba(128,240,255,0.75)"
            disabled={disabled}
            onPressStart={() => {
              actions.pressWeapon();
              actions.setWeaponHeld(true);
            }}
            onPressEnd={() => actions.releaseWeapon()}
          />
        ) : (
          <div style={{ width: actionSize, height: actionSize }} aria-hidden />
        )}
      </div>
    </div>
  );
}

function MobileControlPad({
  actions,
  slurpLabel,
  showWeaponButton,
  disabled,
  compact,
}: {
  actions: RainbowCowboyInputActions;
  slurpLabel: string;
  showWeaponButton: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className="rc-mobile-controls"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        pointerEvents: disabled ? "none" : "none",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        className="rc-joystick-anchor"
        style={{
          position: "absolute",
          left: "max(12px, env(safe-area-inset-left))",
          bottom: "max(12px, env(safe-area-inset-bottom))",
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        <VirtualJoystick disabled={disabled} actions={actions} />
      </div>
      <div
        className="rc-action-cluster-anchor"
        style={{
          position: "absolute",
          right: "max(12px, env(safe-area-inset-right))",
          bottom: "max(12px, env(safe-area-inset-bottom))",
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        <MobileActionCluster
          actions={actions}
          slurpLabel={slurpLabel}
          showWeaponButton={showWeaponButton}
          disabled={disabled}
          compact={compact}
        />
      </div>
    </div>
  );
}

export function RainbowCowboyControls({
  actions,
  slurpLabel = "SLURP",
  showWeaponButton = false,
  disabled,
}: Props) {
  const mobile = useMobileControls();
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!mobile) return;

    const releaseAll = () => {
      actions.releaseMovement();
      actions.releaseWeapon();
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    const onBlur = () => releaseAll();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      releaseAll();
    };
  }, [actions, mobile]);

  if (!mobile) return null;

  return (
    <>
      <MobileControlPad
        actions={actions}
        slurpLabel={slurpLabel}
        showWeaponButton={showWeaponButton}
        disabled={disabled}
        compact={portrait}
      />
      <style>{`
        @media (max-width: 900px), (max-height: 500px), (pointer: coarse) {
          .rc-mobile-controls {
            display: block !important;
            pointer-events: auto !important;
          }
        }
      `}</style>
    </>
  );
}
