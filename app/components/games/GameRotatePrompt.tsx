"use client";

type Props = {
  emoji?: string;
  title?: string;
  subtitle?: string;
};

/** Shown on phones in portrait while a game is running — asks the player to rotate. */
export function GameRotatePrompt({
  emoji = "🕹️",
  title = "Turn your phone sideways",
  subtitle = "Rotate to landscape for the best gameplay experience.",
}: Props) {
  return (
    <div className="game-rotate-prompt" role="status" aria-live="polite">
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
    </div>
  );
}
