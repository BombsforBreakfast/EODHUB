"use client";

import { useEffect, useState } from "react";
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
  const percent = progress ? Math.min(100, progress.raisedCents / (progress.goalCents * 2) * 100) : 0;
  return <div className={styles.progress}>
    <div className={styles.progressLabel}><span>keeps it going</span><span>helps it grow</span></div>
    <div role="progressbar" aria-label="Monthly Hub support" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ? percent : undefined} aria-valuetext={progress ? (percent >= 50 ? "Helping the Hub grow" : "Keeping the Hub going") : "Support progress unavailable"} className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${percent}%` }} /><span className={styles.progressMidpoint} aria-hidden="true" /></div>
  </div>;
}
