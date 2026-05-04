"use client";

import { usePathname } from "next/navigation";
import BetaAccessModal from "./BetaAccessModal";

/**
 * Renders the beta gate on marketing root and login only (one instance via root layout).
 * Other routes (e.g. /terms) stay readable without the gate.
 */
export default function BetaAccessGate() {
  const pathname = usePathname();
  const atRoot = pathname === "/";
  const atLogin = pathname === "/login";
  if (!atRoot && !atLogin) return null;
  return <BetaAccessModal />;
}
