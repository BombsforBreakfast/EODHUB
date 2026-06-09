import { BSM_ACCENT, BSM_OLIVE, BSM_OLIVE_LIGHT } from "./bombSuitManTheme";

interface Props {
  size?: number;
}

/** Hub / level-select mascot for Bomb Suit Man. */
export function BombSuitManAvatar({ size = 48 }: Props) {
  const fontSize = Math.max(11, Math.round(size * 0.3));
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(180deg, ${BSM_OLIVE_LIGHT}, ${BSM_OLIVE})`,
        border: `3px solid ${BSM_ACCENT}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.22)",
      }}
    >
      <span
        style={{
          fontWeight: 900,
          fontSize,
          color: BSM_ACCENT,
          letterSpacing: "0.06em",
          lineHeight: 1,
        }}
      >
        BSM
      </span>
    </div>
  );
}
