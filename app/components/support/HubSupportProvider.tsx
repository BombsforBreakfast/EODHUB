"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { isNativeApp } from "@/app/lib/native/isNativeApp";
import styles from "./hubSupport.module.css";

export type SupportView = "contribute" | "why";
const SupportModal = dynamic(() => import("./HubSupportModal"), { ssr: false });
const SupportContext = createContext<{ web: boolean; open: (view: SupportView) => void }>({ web: false, open: () => {} });
const subscribe = () => () => {};
const webSnapshot = () => !isNativeApp();
const serverSnapshot = () => false;

export function HubSupportProvider({ children }: { children: React.ReactNode }) {
  // No contribution CTA in server HTML or before the native platform is known.
  const web = useSyncExternalStore(subscribe, webSnapshot, serverSnapshot);
  const [view, setView] = useState<SupportView | null>(null);
  const open = useCallback((next: SupportView) => { if (!isNativeApp()) setView(next); }, []);
  return <SupportContext.Provider value={{ web, open }}>
    {children}
    {web && view ? <SupportModal view={view} onChange={setView} onClose={() => setView(null)} /> : null}
  </SupportContext.Provider>;
}

export function WebSupportOnly({ children }: { children: React.ReactNode }) {
  return useContext(SupportContext).web ? children : null;
}

export function HubSupportButton({ onOpen }: { onOpen?: () => void }) {
  const { web, open } = useContext(SupportContext);
  if (!web) return null;
  function choose(view: SupportView) { open(view); onOpen?.(); }
  return <div className={styles.split} role="group" aria-label="Support EOD-HUB">
    <button type="button" className={styles.support} onClick={() => choose("contribute")}>Support the Hub</button>
    <button type="button" className={styles.why} aria-label="Why support the Hub?" title="Why support the Hub?" onClick={() => choose("why")}><span aria-hidden="true">ⓘ</span></button>
  </div>;
}
