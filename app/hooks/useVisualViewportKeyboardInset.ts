"use client";

import { useEffect, useState } from "react";

/** Pixels of layout viewport covered by the on-screen keyboard (0 when closed). */
export function useVisualViewportKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      setInset(0);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setInset(Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      setInset(0);
    };
  }, [active]);

  return inset;
}
