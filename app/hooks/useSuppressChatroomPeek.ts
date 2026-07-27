"use client";

import { useEffect } from "react";
import { releaseChatroomPeek, suppressChatroomPeek } from "../lib/chatroomPeekSuppress";

/** While `active`, hide the global Team Room peek bar (modal, sidebar compose, etc.). */
export function useSuppressChatroomPeek(active: boolean, reason: string): void {
  useEffect(() => {
    if (!active || !reason) return;
    suppressChatroomPeek(reason);
    return () => releaseChatroomPeek(reason);
  }, [active, reason]);
}
