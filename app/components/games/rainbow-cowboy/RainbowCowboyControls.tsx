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

const JOYSTICK_VISUAL_SIZE = 112;
const JOYSTICK_PAD_SIZE = 168;
const JOYSTICK_STICK_MAX = 44;
const JOYSTICK_H_THRESH = 7;
const JOYSTICK_V_THRESH = 11;

function VirtualJoystick({
  disabled,
  actions,
}: {
  disabled?: boolean;
  actions: RainbowCowboyInputActions;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);
  const unbindWindowRef = useRef<(() => void) | null>(null);

  const unbindWindowTracking = useCallback(() => {
    unbindWindowRef.current?.();
    unbindWindowRef.current = null;
  }, []);

  const reset = useCallback(() => {
    unbindWindowTracking();
    setStick({ x: 0, y: 0 });
    actions.releaseMovement();
    activePointerRef.current = null;
  }, [actions, unbindWindowTracking]);

  const applyFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const zone = zoneRef.current;
      if (!zone) return;

      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);

      let vx = dx;
      let vy = dy;
      if (dist > JOYSTICK_STICK_MAX) {
        vx = (dx / dist) * JOYSTICK_STICK_MAX;
        vy = (dy / dist) * JOYSTICK_STICK_MAX;
      }
      setStick({ x: vx, y: vy });

      const radius = rect.width / 2;
      const horizDominant = Math.abs(dx) >= Math.abs(dy) * 0.55;
      const pastEdge = Math.abs(dx) > radius - 6;
      actions.setMoveLeft(dx < -JOYSTICK_H_THRESH && (horizDominant || pastEdge));
      actions.setMoveRight(dx > JOYSTICK_H_THRESH && (horizDominant || pastEdge));
      actions.setDuck(dy > JOYSTICK_V_THRESH && Math.abs(dy) > Math.abs(dx) * 0.65);
    },
    [actions],
  );

  const bindWindowTracking = useCallback(
    (pointerId: number) => {
      unbindWindowTracking();

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        e.preventDefault();
        applyFromClient(e.clientX, e.clientY);
      };
      const onEnd = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        reset();
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      unbindWindowRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };
    },
    [applyFromClient, reset, unbindWindowTracking],
  );

  useEffect(() => () => reset(), [reset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    activePointerRef.current = e.pointerId;
    padRef.current?.setPointerCapture(e.pointerId);
    bindWindowTracking(e.pointerId);
    applyFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    applyFromClient(e.clientX, e.clientY);
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    reset();
  };

  return (
    <div
      ref={padRef}
      className="rc-joystick-pad"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{
        width: JOYSTICK_PAD_SIZE,
        height: JOYSTICK_PAD_SIZE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
      }}
    >
      <div
        ref={zoneRef}
        className="rc-joystick"
        style={{
          position: "relative",
          width: JOYSTICK_VISUAL_SIZE,
          height: JOYSTICK_VISUAL_SIZE,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.42)",
          border: "2px solid rgba(255,255,255,0.35)",
          pointerEvents: "none",
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
          left: "var(--rc-safe-left, max(12px, env(safe-area-inset-left)))",
          bottom: "var(--rc-safe-bottom, max(12px, env(safe-area-inset-bottom)))",
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        <VirtualJoystick disabled={disabled} actions={actions} />
      </div>
      <div
        className="rc-action-cluster-anchor"
        style={{
          position: "absolute",
          right: "var(--rc-mobile-right-gutter, max(12px, env(safe-area-inset-right)))",
          bottom: "var(--rc-safe-bottom, max(12px, env(safe-area-inset-bottom)))",
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
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const sync = () => {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      const narrow = window.innerWidth < 740;
      setCompact(portrait || narrow);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
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
        compact={compact}
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
