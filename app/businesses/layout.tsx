"use client";

import type { ReactNode } from "react";
import MasterShell from "../components/master/MasterShell";

export default function BusinessesLayout({ children }: { children: ReactNode }) {
  return <MasterShell>{children}</MasterShell>;
}
