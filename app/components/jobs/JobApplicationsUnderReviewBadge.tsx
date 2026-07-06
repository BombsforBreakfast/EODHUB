"use client";

type Props = {
  /** Full-width tab strip on cards; inline pill in dense rows. */
  variant?: "tab" | "pill";
};

export default function JobApplicationsUnderReviewBadge({ variant = "tab" }: Props) {
  if (variant === "pill") {
    return (
      <span
        aria-label="Applications under review"
        style={{
          display: "inline-block",
          background: "#fef08a",
          color: "#854d0e",
          borderRadius: 20,
          padding: "2px 10px",
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: "nowrap",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        Applications under review
      </span>
    );
  }

  return (
    <div
      aria-label="Applications under review"
      style={{
        background: "#fef08a",
        color: "#854d0e",
        padding: "7px 12px",
        fontSize: 12,
        fontWeight: 800,
        textAlign: "center",
        letterSpacing: 0.2,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      Applications under review
    </div>
  );
}
