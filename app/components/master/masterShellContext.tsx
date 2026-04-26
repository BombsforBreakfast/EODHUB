"use client";

import React, { createContext, useContext } from "react";

export type MasterShellContextValue = {
  /** True when viewport is desktop and the persistent shell is active. */
  isDesktopShell: boolean;
  /** Opens the shell message drawer (desktop). No-op when not on desktop shell. */
  openSidebarPeer: (peerId: string) => void;
  /** When false, home feed does not show large memorial anniversary post cards (default true). */
  showMemorialFeedCards: boolean;
  setShowMemorialFeedCards: (v: boolean) => void;
};

const MasterShellContext = createContext<MasterShellContextValue>({
  isDesktopShell: false,
  openSidebarPeer: () => {},
  showMemorialFeedCards: true,
  setShowMemorialFeedCards: () => {},
});

export function MasterShellProvider({
  value,
  children,
}: {
  value: MasterShellContextValue;
  children: React.ReactNode;
}) {
  return <MasterShellContext.Provider value={value}>{children}</MasterShellContext.Provider>;
}

export function useMasterShell() {
  return useContext(MasterShellContext);
}
