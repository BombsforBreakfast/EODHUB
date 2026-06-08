"use client";

import { useEffect, useRef } from "react";
import {
  drawActionAnimation,
  getActionAnimationDuration,
  getActionAnimationSize,
  type RenderSafeActionAnimationType,
} from "./renderSafeActionAnimations";

interface Props {
  type: RenderSafeActionAnimationType;
  onComplete: () => void;
}

export function RenderSafeActionAnimationOverlay({ type, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const { width: CANVAS_W, height: CANVAS_H } = getActionAnimationSize(type);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const duration = getActionAnimationDuration(type);
    const start = performance.now();
    let raf = 0;
    let done = false;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      drawActionAnimation(ctx, CANVAS_W, CANVAS_H, type, progress);

      if (progress >= 1) {
        if (!done) {
          done = true;
          onCompleteRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [type, CANVAS_W, CANVAS_H]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
        padding: 16,
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          width:
            type === "bridge_remote_pull" || type === "target_assault" || type === "avalanche_evac"
              ? "min(94vw, 360px)"
              : "min(92vw, 320px)",
          height: "auto",
          aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
          imageRendering: "pixelated",
          borderRadius: 12,
          border:
            type === "detonation"
              ? "2px solid rgba(239,68,68,0.55)"
              : type === "bridge_remote_pull" || type === "target_assault" || type === "avalanche_evac"
                ? "2px solid rgba(34,197,94,0.45)"
                : "2px solid rgba(249,115,22,0.45)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}
