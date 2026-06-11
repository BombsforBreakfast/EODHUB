"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RainbowCowboyInputActions } from "./rainbowCowboyGameInput";
import {
  getControlMetrics,
  loadRainbowCowboyControlPrefs,
  triggerControlHaptic,
  type RainbowCowboyControlPrefs,
} from "./rainbowCowboyControlPrefs";

interface Props {
  actions: RainbowCowboyInputActions;
  attackLabel?: string;
  specialLabel?: string;
  specialCharges?: number;
  showWeaponButton?: boolean;
  disabled?: boolean;
  controlPrefs?: RainbowCowboyControlPrefs;
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

function useControlActivityFade(disabled?: boolean) {
  const [active, setActive] = useState(true);
  const timerRef = useRef<number | null>(null);

  const bump = useCallback(() => {
    setActive(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setActive(false), 2200);
  }, []);

  useEffect(() => {
    if (disabled) setActive(true);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [disabled]);

  return { controlsActive: disabled || active, bumpActivity: bump };
}

const JOYSTICK_H_THRESH = 5;
const JOYSTICK_V_THRESH = 7;

/** Extra touch slop beyond the visible ring (left / up / right / down). */
const JOYSTICK_HIT_SLOP = { left: 26, top: 26, right: 26, bottom: 10 } as const;

function VirtualJoystick({
  disabled,
  actions,
  metrics,
  prefs,
  opacity,
  onActivity,
}: {
  disabled?: boolean;
  actions: RainbowCowboyInputActions;
  metrics: ReturnType<typeof getControlMetrics>;
  prefs: RainbowCowboyControlPrefs;
  opacity: number;
  onActivity: () => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [engaged, setEngaged] = useState(false);
  const activePointerRef = useRef<number | null>(null);
  const unbindWindowRef = useRef<(() => void) | null>(null);
  const stickMax = metrics.joystickOuter * 0.38;

  const unbindWindowTracking = useCallback(() => {
    unbindWindowRef.current?.();
    unbindWindowRef.current = null;
  }, []);

  const reset = useCallback(() => {
    unbindWindowTracking();
    setStick({ x: 0, y: 0 });
    setEngaged(false);
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
      if (dist > stickMax) {
        vx = (dx / dist) * stickMax;
        vy = (dy / dist) * stickMax;
      }
      setStick({ x: vx, y: vy });

      const moveLeft = dx < -JOYSTICK_H_THRESH;
      const moveRight = dx > JOYSTICK_H_THRESH;
      const duck = dy > JOYSTICK_V_THRESH && dy > Math.abs(dx) * 0.45;
      const aimUp = dy < -JOYSTICK_V_THRESH && Math.abs(dy) >= Math.abs(dx) * 0.45;

      actions.setMoveLeft(moveLeft);
      actions.setMoveRight(moveRight);
      actions.setDuck(duck);
      actions.setAimUp(aimUp);
    },
    [actions, stickMax],
  );

  const bindWindowTracking = useCallback(
    (pointerId: number) => {
      unbindWindowTracking();

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        e.preventDefault();
        onActivity();
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
    [applyFromClient, onActivity, reset, unbindWindowTracking],
  );

  useEffect(() => () => reset(), [reset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    onActivity();
    triggerControlHaptic(prefs);
    setEngaged(true);
    activePointerRef.current = e.pointerId;
    padRef.current?.setPointerCapture(e.pointerId);
    bindWindowTracking(e.pointerId);
    applyFromClient(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    onActivity();
    applyFromClient(e.clientX, e.clientY);
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    reset();
  };

  const hitWidth = metrics.joystickOuter + JOYSTICK_HIT_SLOP.left + JOYSTICK_HIT_SLOP.right;
  const hitHeight = metrics.joystickOuter + JOYSTICK_HIT_SLOP.top + JOYSTICK_HIT_SLOP.bottom;

  return (
    <div
      ref={padRef}
      className="rc-joystick-hit"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{
        position: "relative",
        width: hitWidth,
        height: hitHeight,
        touchAction: "none",
        opacity,
        transition: "opacity 280ms ease",
      }}
    >
      <div
        ref={zoneRef}
        className="rc-joystick"
        style={{
          position: "absolute",
          left: JOYSTICK_HIT_SLOP.left,
          bottom: JOYSTICK_HIT_SLOP.bottom,
          width: metrics.joystickOuter,
          height: metrics.joystickOuter,
          borderRadius: "50%",
          background: "rgba(42, 46, 52, 0.58)",
          border: "2px solid rgba(255,255,255,0.22)",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.2)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: metrics.joystickStick,
            height: metrics.joystickStick,
            marginLeft: -metrics.joystickStick / 2 + stick.x,
            marginTop: -metrics.joystickStick / 2 + stick.y,
            borderRadius: "50%",
            background: "rgba(220, 224, 230, 0.28)",
            border: "2px solid rgba(255,255,255,0.42)",
            boxShadow: engaged ? "0 0 12px rgba(255,255,255,0.25)" : "none",
            pointerEvents: "none",
            transition: engaged ? "none" : "margin 120ms ease",
          }}
        />
      </div>
    </div>
  );
}

function ArcadeActionButton({
  label,
  sub,
  size,
  tone,
  disabled,
  cooldownPct,
  onPress,
  onPressStart,
  onPressEnd,
  prefs,
  opacity,
  onActivity,
}: {
  label: string;
  sub?: string;
  size: number;
  tone: "jump" | "attack" | "special" | "gun";
  disabled?: boolean;
  cooldownPct?: number;
  onPress?: () => void;
  onPressStart?: () => void;
  onPressEnd?: () => void;
  prefs: RainbowCowboyControlPrefs;
  opacity: number;
  onActivity: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const firedRef = useRef(false);

  const tones = {
    jump: {
      border: "rgba(120, 220, 140, 0.75)",
      fill: "rgba(34, 120, 58, 0.55)",
      glow: "rgba(120, 255, 150, 0.45)",
      pressed: "rgba(48, 160, 78, 0.72)",
    },
    attack: {
      border: "rgba(255, 190, 90, 0.8)",
      fill: "rgba(180, 110, 20, 0.52)",
      glow: "rgba(255, 200, 100, 0.4)",
      pressed: "rgba(210, 140, 30, 0.75)",
    },
    special: {
      border: "rgba(255, 120, 220, 0.75)",
      fill: "rgba(120, 40, 140, 0.5)",
      glow: "rgba(255, 100, 200, 0.42)",
      pressed: "rgba(160, 60, 180, 0.72)",
    },
    gun: {
      border: "rgba(120, 220, 255, 0.7)",
      fill: "rgba(20, 90, 120, 0.5)",
      glow: "rgba(100, 220, 255, 0.35)",
      pressed: "rgba(40, 130, 170, 0.72)",
    },
  }[tone];

  const handleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || (cooldownPct != null && cooldownPct > 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    firedRef.current = false;
    onActivity();
    triggerControlHaptic(prefs, tone === "special");
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

  const onCooldown = cooldownPct != null && cooldownPct > 0;

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
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${tones.border}`,
        background: pressed ? tones.pressed : tones.fill,
        color: "#fff",
        fontFamily: "monospace",
        fontWeight: 800,
        cursor: disabled || onCooldown ? "not-allowed" : "pointer",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1.05,
        padding: 4,
        opacity: disabled ? 0.45 : onCooldown ? opacity * 0.55 : opacity,
        transform: pressed ? "scale(0.92)" : "scale(1)",
        boxShadow: pressed ? `0 0 18px ${tones.glow}` : `0 2px 10px rgba(0,0,0,0.28)`,
        transition: "transform 70ms ease, box-shadow 70ms ease, opacity 280ms ease, background 70ms ease",
        overflow: "hidden",
      }}
    >
      <span style={{ fontSize: size >= 88 ? 12 : 10, letterSpacing: 0.3 }}>{label}</span>
      {sub ? (
        <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.88, marginTop: 2, textAlign: "center" }}>
          {sub}
        </span>
      ) : null}
      {onCooldown ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `conic-gradient(rgba(0,0,0,0.55) ${cooldownPct * 360}deg, transparent 0)`,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </button>
  );
}

function MobileActionTriangle({
  actions,
  attackLabel,
  specialLabel,
  specialCharges,
  showWeaponButton,
  disabled,
  metrics,
  prefs,
  opacity,
  onActivity,
}: {
  actions: RainbowCowboyInputActions;
  attackLabel: string;
  specialLabel: string;
  specialCharges: number;
  showWeaponButton: boolean;
  disabled?: boolean;
  metrics: ReturnType<typeof getControlMetrics>;
  prefs: RainbowCowboyControlPrefs;
  opacity: number;
  onActivity: () => void;
}) {
  const specialShort = specialLabel.split(" ")[0] ?? "Special";
  const specialSub =
    specialCharges > 0 ? `${specialShort} ×${specialCharges}` : "EMPTY";

  return (
    <div
      className="rc-action-cluster"
      style={{
        opacity,
        transition: "opacity 280ms ease",
      }}
    >
      <div className="rc-action-slot rc-action-slot--jump">
        <ArcadeActionButton
          label="JUMP"
          size={metrics.jump}
          tone="jump"
          disabled={disabled}
          prefs={prefs}
          opacity={1}
          onActivity={onActivity}
          onPress={actions.pressJump}
        />
      </div>

      <div className="rc-action-slot rc-action-slot--attack">
        <ArcadeActionButton
          label="ATK"
          sub={attackLabel.length > 10 ? attackLabel.slice(0, 9) + "…" : attackLabel}
          size={metrics.attack}
          tone="attack"
          disabled={disabled}
          prefs={prefs}
          opacity={1}
          onActivity={onActivity}
          onPress={actions.pressSlurp}
        />
      </div>

      <div className="rc-action-slot rc-action-slot--special">
        <ArcadeActionButton
          label="SPEC"
          sub={specialSub}
          size={metrics.special}
          tone="special"
          disabled={disabled || specialCharges <= 0}
          cooldownPct={specialCharges <= 0 ? 1 : 0}
          prefs={prefs}
          opacity={1}
          onActivity={onActivity}
          onPress={actions.pressSpecial}
        />
      </div>

      {showWeaponButton ? (
        <div className="rc-action-slot rc-action-slot--gun">
          <ArcadeActionButton
            label="GUN"
            sub="HOLD"
            size={metrics.gun}
            tone="gun"
            disabled={disabled}
            prefs={prefs}
            opacity={1}
            onActivity={onActivity}
            onPressStart={() => {
              actions.pressWeapon();
              actions.setWeaponHeld(true);
            }}
            onPressEnd={() => actions.releaseWeapon()}
          />
        </div>
      ) : null}
    </div>
  );
}

function MobileControlPad({
  actions,
  attackLabel,
  specialLabel,
  specialCharges,
  showWeaponButton,
  disabled,
  prefs,
  controlsActive,
  bumpActivity,
}: {
  actions: RainbowCowboyInputActions;
  attackLabel: string;
  specialLabel: string;
  specialCharges: number;
  showWeaponButton: boolean;
  disabled?: boolean;
  prefs: RainbowCowboyControlPrefs;
  controlsActive: boolean;
  bumpActivity: () => void;
}) {
  const [metrics, setMetrics] = useState(() => getControlMetrics(prefs));

  useEffect(() => {
    const sync = () => setMetrics(getControlMetrics(prefs));
    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [prefs]);

  const opacity = controlsActive ? metrics.opacityBase : metrics.opacityInactive;

  return (
    <div
      className={`rc-mobile-controls${disabled ? " rc-mobile-controls--disabled" : ""}`}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        touchAction: "none",
      }}
    >
      <div className="rc-joystick-anchor">
        <VirtualJoystick
          disabled={disabled}
          actions={actions}
          metrics={metrics}
          prefs={prefs}
          opacity={opacity}
          onActivity={bumpActivity}
        />
      </div>
      <div className="rc-action-cluster-anchor">
        <MobileActionTriangle
          actions={actions}
          attackLabel={attackLabel}
          specialLabel={specialLabel}
          specialCharges={specialCharges}
          showWeaponButton={showWeaponButton}
          disabled={disabled}
          metrics={metrics}
          prefs={prefs}
          opacity={opacity}
          onActivity={bumpActivity}
        />
      </div>
    </div>
  );
}

export function RainbowCowboyControls({
  actions,
  attackLabel = "Attack",
  specialLabel = "Special",
  specialCharges = 0,
  showWeaponButton = false,
  disabled,
  controlPrefs: controlPrefsProp,
}: Props) {
  const mobile = useMobileControls();
  const [controlPrefs, setControlPrefs] = useState<RainbowCowboyControlPrefs>(
    () => controlPrefsProp ?? loadRainbowCowboyControlPrefs(),
  );
  const { controlsActive, bumpActivity } = useControlActivityFade(disabled);

  useEffect(() => {
    if (controlPrefsProp) setControlPrefs(controlPrefsProp);
  }, [controlPrefsProp]);

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
        attackLabel={attackLabel}
        specialLabel={specialLabel}
        specialCharges={specialCharges}
        showWeaponButton={showWeaponButton}
        disabled={disabled}
        prefs={controlPrefs}
        controlsActive={controlsActive}
        bumpActivity={bumpActivity}
      />
      <style>{`
        @media (max-width: 900px), (max-height: 500px), (pointer: coarse) {
          .rc-mobile-controls {
            display: block !important;
          }
        }
      `}</style>
    </>
  );
}
