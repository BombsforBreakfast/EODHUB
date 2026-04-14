"use client";

import React, { createContext, useContext } from "react";

export type MasterShellContextValue = {
  /** True when viewport is desktop and the persistent shell is active. */
  isDesktopShell: boolean;
  /** Opens the shell message drawer (desktop). No-op when not on desktop shell. */
  openSidebarPeer: (peerId: string) => void;
};

const MasterShellContext = createContext<MasterShellContextValue>({
  isDesktopShell: false,
  openSidebarPeer: () => {},
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
