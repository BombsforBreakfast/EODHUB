"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import {
  BSM_ACCENT_LIGHT,
  BSM_BUTTON_BORDER,
  BSM_RIDE_ACTIVE_GRADIENT,
} from "../bomb-suit-man/bombSuitManTheme";
import type { UnicornHeroRideConfig, UnicornHeroRideType } from "./unicornHeroRides";
import { UNICORN_HERO_RIDES } from "./unicornHeroRides";

interface Props {
  selected: UnicornHeroRideType;
  onChange: (ride: UnicornHeroRideType) => void;
}

const RIDE_EMOJI: Record<UnicornHeroRideType, string> = {
  unicorn: "🦄",
  eod_robot: "🤖",
};

function RideOption({
  ride,
  selected,
  onChange,
}: {
  ride: UnicornHeroRideConfig;
  selected: UnicornHeroRideType;
  onChange: (ride: UnicornHeroRideType) => void;
}) {
  const { t } = useTheme();
  const active = selected === ride.id;

  return (
    <button
      type="button"
      onClick={() => onChange(ride.id)}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: active ? `3px solid ${BSM_BUTTON_BORDER}` : `2px solid ${t.borderLight}`,
        background: active ? BSM_RIDE_ACTIVE_GRADIENT : "rgba(0,0,0,0.25)",
        cursor: "pointer",
        color: t.text,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6 }}>{RIDE_EMOJI[ride.id]}</div>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4, color: active ? BSM_ACCENT_LIGHT : t.text }}>
        {ride.label}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: t.textMuted }}>{ride.description}</div>
      <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, opacity: 0.9 }}>
        {ride.attackLabel} · {ride.specialLabel}
      </div>
    </button>
  );
}

export function UnicornHeroRideSelect({ selected, onChange }: Props) {
  const { t } = useTheme();

  return (
    <div style={{ marginBottom: 20, textAlign: "left" }}>
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 18,
          fontWeight: 900,
          textAlign: "center",
          color: BSM_ACCENT_LIGHT,
        }}
      >
        Choose Your Ride
      </h2>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexDirection: "row",
          flexWrap: "wrap",
        }}
      >
        {UNICORN_HERO_RIDES.map((ride) => (
          <RideOption key={ride.id} ride={ride} selected={selected} onChange={onChange} />
        ))}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 11, color: t.textMuted, textAlign: "center" }}>
        Same levels, scoring, and high scores for both rides.
      </p>
    </div>
  );
}
