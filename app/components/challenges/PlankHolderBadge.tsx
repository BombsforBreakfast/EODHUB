"use client";

type Props = {
  number?: number | null;
  small?: boolean;
};

export function PlankHolderBadge({ number, small = false }: Props) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "#ecfeff",
        color: "#155e75",
        border: "1px solid rgba(14, 116, 144, 0.25)",
        borderRadius: 999,
        padding: small ? "2px 8px" : "3px 10px",
        fontSize: small ? 10 : 11,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
      title={number ? `Plank Holder #${number}` : "Plank Holder"}
    >
      <span aria-hidden>⚓</span>
      <span>Plank Holder{number ? ` #${number}` : ""}</span>
    </span>
  );
}
