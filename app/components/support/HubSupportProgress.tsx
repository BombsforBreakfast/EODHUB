"use client";

import { useEffect, useState } from "react";
import { supportDollars } from "@/app/lib/hubSupport";
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
  const percent = progress ? Math.min(100, Math.round(progress.raisedCents / progress.goalCents * 100)) : 0;
  return <div className={styles.progress}>
    <div className={styles.progressLabel}><span>Support the Hub · this month</span><span>{progress ? `${supportDollars(progress.raisedCents)} / ${supportDollars(progress.goalCents)}` : "Totals unavailable"}</span></div>
    {progress ? <div role="progressbar" aria-label="Monthly Hub operating costs covered" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className={styles.progressTrack}><div style={{ width: `${percent}%` }} /></div> : null}
  </div>;
}
