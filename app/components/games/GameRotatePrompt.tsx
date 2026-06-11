"use client";

import { createPortal } from "react-dom";
import { usePortraitRotateGate } from "./usePortraitRotateGate";

type Props = {
  active?: boolean;
  emoji?: string;
  title?: string;
  subtitle?: string;
};

/** Shown on phones in portrait while a game is running — persists until the device rotates. */
export function GameRotatePrompt({
  active = true,
  emoji = "🕹️",
  title = "Turn your phone sideways",
  subtitle = "Rotate to landscape for the best gameplay experience.",
}: Props) {
  const show = usePortraitRotateGate(active);

  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="game-rotate-prompt game-rotate-prompt--visible"
      role="status"
      aria-live="polite"
    >
      <div className="game-rotate-prompt-card">
        <span className="game-rotate-prompt-phone" aria-hidden>
          📱
        </span>
        <span className="game-rotate-prompt-arrow" aria-hidden>
          ↻
        </span>
        <span className="game-rotate-prompt-emoji" aria-hidden>
          {emoji}
        </span>
        <p className="game-rotate-prompt-title">{title}</p>
        <p className="game-rotate-prompt-subtitle">{subtitle}</p>
      </div>
    </div>,
    document.body,
  );
}
