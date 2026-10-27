"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./hubSupport.module.css";

export default function HubSupportProgress() {
  const [progress, setProgress] = useState<{ raisedCents: number; goalCents: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/hub-support/progress", { signal: controller.signal })
      .then(async response => { if (response.ok) setProgress(await response.json()); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const scaleCents = (progress?.goalCents ?? 17600) * 2;
  const percent = progress ? Math.max(0, Math.min(100, progress.raisedCents / scaleCents * 100)) : 0;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "America/New_York" }).format(new Date());
  // Clip a track-wide gradient so a small contribution only reveals its red portion.
  const fillStyle = {
    clipPath: `inset(0 ${100 - percent}% 0 0 round 8px)`,
    "--support-red-stop": `${1000 / scaleCents * 100}%`,
  } as CSSProperties;

  return <div className={styles.progress}>
    <div className={styles.progressLabel}>
      <span>keeps it going</span>
      <span className={styles.progressMonth}>{month}</span>
      <span>helps it grow</span>
    </div>
    <div role="progressbar" aria-label="Monthly Hub support" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ? percent : undefined} aria-valuetext={progress ? (percent >= 50 ? "Helping the Hub grow" : "Keeping the Hub going") : "Support progress unavailable"} className={styles.progressTrack}>
      <div className={styles.progressFill} style={fillStyle} />
      <span className={styles.progressMidpoint} aria-hidden="true" />
    </div>
  </div>;
}

