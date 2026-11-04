"use client";
import Link from "next/link";
import type { CSSProperties,ReactNode } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import s from "./account.module.css";
export default function AccountFrame({children}:{children:ReactNode}){
  const {t,isDark,toggleDark}=useTheme();
  return <main className={s.page} style={{"--ac-bg":t.bg,"--ac-surface":t.surface,"--ac-line":t.border,"--ac-input":t.input,"--ac-accent":"#6352df",color:t.text} as CSSProperties}><div className={s.inner}><header className={s.header}><Link className={s.brand} href="/account">EOD-HUB</Link><nav className={s.nav} aria-label="EOD-HUB portals"><Link href="/login">Hub</Link><Link href="/promote/rentals">Rentals</Link><Link href="/account?portal=events">Events</Link><button className={s.textButton} onClick={toggleDark}>{isDark?"Light":"Dark"} mode</button></nav></header>{children}</div></main>;
}
