"use client";

import { useEffect, useState } from "react";

/** ~large-phone breakpoint; used when parent does not pass `isMobile`. */
const SCRAPBOOK_COMPACT_MQ = "(max-width: 640px)";

/**
 * True when scrapbook UI should use compact / touch-first layout.
 * If `isMobileProp` is set, it wins; otherwise uses viewport matchMedia.
 */
export function useScrapbookCompact(isMobileProp?: boolean): boolean {
  const [mqCompact, setMqCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(SCRAPBOOK_COMPACT_MQ);
    function sync() {
      setMqCompact(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (typeof isMobileProp === "boolean") return isMobileProp;
  return mqCompact;
}
