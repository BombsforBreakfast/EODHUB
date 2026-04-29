"use client";

import React from "react";

const STAR_POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundToNearestHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function getFillRatio(value: number, index: number): number {
  const delta = value - index;
  if (delta >= 1) return 1;
  if (delta <= 0) return 0;
  return roundToNearestHalf(delta);
}

function StarIcon({
  fillRatio,
  size,
  activeColor,
  emptyColor,
  idPrefix,
}: {
  fillRatio: number;
  size: number;
  activeColor: string;
  emptyColor: string;
  idPrefix: string;
}) {
  const gradientId = `${idPrefix}-grad`;
  const widthPercent = `${clamp(fillRatio, 0, 1) * 100}%`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={widthPercent} stopColor={activeColor} />
          <stop offset={widthPercent} stopColor={emptyColor} />
        </linearGradient>
      </defs>
      <polygon points={STAR_POINTS} fill={`url(#${gradientId})`} stroke={activeColor} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function StarRatingDisplay({
  value,
  size = 16,
  activeColor = "#f59e0b",
  emptyColor = "rgba(148, 163, 184, 0.28)",
}: {
  value: number;
  size?: number;
  activeColor?: string;
  emptyColor?: string;
}) {
  const safeValue = clamp(value, 0, 5);
  const stars = Array.from({ length: 5 }, (_, i) => {
    const fillRatio = getFillRatio(safeValue, i);
    return (
      <StarIcon
        key={`star-display-${i}`}
        fillRatio={fillRatio}
        size={size}
        activeColor={activeColor}
        emptyColor={emptyColor}
        idPrefix={`star-display-${i}-${Math.round(safeValue * 10)}`}
      />
    );
  });
  return <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>{stars}</div>;
}

export function StarRatingInput({
  value,
  onChange,
  size = 22,
  activeColor = "#f59e0b",
  emptyColor = "rgba(148, 163, 184, 0.28)",
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  size?: number;
  activeColor?: string;
  emptyColor?: string;
}) {
  const safeValue = value ?? 0;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1;
        const fillRatio = getFillRatio(safeValue, i);
        return (
          <button
            key={`star-input-${starValue}`}
            type="button"
            onClick={() => onChange(value === starValue ? null : starValue)}
            aria-label={value === starValue ? `Clear ${starValue} star rating` : `Set ${starValue} star rating`}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              lineHeight: 0,
              display: "inline-flex",
            }}
          >
            <StarIcon
              fillRatio={fillRatio}
              size={size}
              activeColor={activeColor}
              emptyColor={emptyColor}
              idPrefix={`star-input-${starValue}-${safeValue}`}
            />
          </button>
        );
      })}
    </div>
  );
}
