"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import BetaAccessModal, { type BetaGatePhase } from "./BetaAccessModal";

/**
 * Renders the beta gate on marketing root and login only (one instance via root layout).
 * Other routes (e.g. /terms) stay readable without the gate.
 */
export default function BetaAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const atRoot = pathname === "/";
  const atLogin = pathname === "/login";
  const gateActive = atRoot || atLogin;
  const [phase, setPhase] = useState<BetaGatePhase>("checking");

  if (!gateActive) {
    return <>{children}</>;
  }

  // DEBUG(beta-gate): block login/page clicks until server confirms grant or user enters code.
  const blockInteraction = phase !== "granted";

  return (
    <>
      <div
        style={blockInteraction ? { pointerEvents: "none", userSelect: "none" } : undefined}
        aria-hidden={blockInteraction}
      >
        {children}
      </div>
      <BetaAccessModal onPhaseChange={setPhase} />
    </>
  );
}
