"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import styles from "./promote.module.css";

export default function AccessForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const form = event.currentTarget;
    const password = new FormData(form).get("password");
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/promote/access", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "We couldn’t unlock the page. Please try again.");
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError("We couldn’t connect. Please try again when you’re back online.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form method="post" action="/api/promote/access" onSubmit={unlock} className={styles.accessForm} aria-busy={isSubmitting}>
      <label htmlFor="promotion-password">Already have an access password?</label>
      <div className={styles.passwordField}>
        <LockKeyhole size={17} aria-hidden="true" />
        <input
          id="promotion-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          maxLength={256}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "promotion-access-error" : undefined}
          disabled={isSubmitting}
        />
        <button
          type="button"
          className={styles.passwordToggle}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((current) => !current)}
        >
          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      <p id="promotion-access-error" className={styles.formError} role="status" aria-live="polite">{error}</p>
      <button className={styles.secondaryButton} type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Opening…" : "View promotion packages"}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  );
}

export function LockPromotionPage() {
  const router = useRouter();
  const [isLocking, setIsLocking] = useState(false);
  const [error, setError] = useState("");
  async function lock() {
    setIsLocking(true);
    setError("");
    try {
      const response = await fetch("/api/promote/access", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not lock page");
      router.refresh();
    } catch {
      setError("Couldn’t lock the page. Please try again.");
    } finally {
      setIsLocking(false);
    }
  }
  return (
    <div className={styles.lockControl}>
      <button type="button" className={styles.textButton} onClick={lock} disabled={isLocking}>
        <LockKeyhole size={15} aria-hidden="true" /> {isLocking ? "Locking…" : "Lock page"}
      </button>
      {error ? <span role="status">{error}</span> : null}
    </div>
  );
}
