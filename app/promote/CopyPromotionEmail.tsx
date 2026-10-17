"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { PROMOTE_EMAIL } from "./contact";
import styles from "./promote.module.css";

type Props = {
  className?: string;
  label?: string;
  showHint?: boolean;
};

export default function CopyPromotionEmail({ className, label = PROMOTE_EMAIL, showHint = false }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const feedbackId = useId();

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(PROMOTE_EMAIL);
      setStatus("copied");
    } catch {
      setStatus("manual");
    }
  }

  return (
    <span className={`${styles.copyContact} ${showHint ? styles.emailContact : ""}`}>
      <button
        type="button"
        className={`${styles.copyEmailButton} ${className ?? ""}`}
        onClick={copyEmail}
        aria-label={`Copy ${PROMOTE_EMAIL}${label !== PROMOTE_EMAIL ? ` — ${label}` : ""}`}
        aria-describedby={feedbackId}
        title={`Copy ${PROMOTE_EMAIL}`}
      >
        <span>{label}</span>
        {status === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <span id={feedbackId} className={styles.copyFeedback} role="status" aria-live="polite">
        {status === "copied"
          ? "Email address copied."
          : status === "manual"
            ? "Select and copy the address below."
            : showHint ? "Click to copy, then paste into your email app." : ""}
      </span>
      {status === "manual" ? (
        <input
          className={styles.copyFallback}
          aria-label="Email address to copy manually"
          type="text"
          value={PROMOTE_EMAIL}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
        />
      ) : null}
    </span>
  );
}
