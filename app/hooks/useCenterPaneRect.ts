"use client";

import { useEffect, useLayoutEffect, useState } from "react";

export type CenterPaneRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function useViewportMobile(maxWidthPx = 900): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidthPx]);

  return mobile;
}

/** Tracks `.master-shell-main` bounds for desktop modals that should fill the center column. */
export function useCenterPaneRect(enabled: boolean): CenterPaneRect | null {
  const [rect, setRect] = useState<CenterPaneRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    function measure() {
      const main = document.querySelector(".master-shell-main");
      if (!main) {
        setRect(null);
        return;
      }
      const bounds = main.getBoundingClientRect();
      setRect({
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      });
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    const main = document.querySelector(".master-shell-main");
    const observer = main ? new ResizeObserver(measure) : null;
    if (main) observer?.observe(main);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  }, [enabled]);

  return rect;
}
