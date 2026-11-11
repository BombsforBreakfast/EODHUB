"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import rentals from "../rentals/rentals.module.css";
import styles from "./job-report.module.css";

export default function JobReportShell({ children }: { children: ReactNode }) {
  const { t, isDark } = useTheme();
  return <div className={`${rentals.page} ${styles.page}`} style={{
    "--ink": t.text, "--muted": t.textMuted, "--paper": t.bg, "--line": t.border,
    "--surface": t.surface, "--hover": t.surfaceHover, "--input": t.input, "--input-border": t.inputBorder,
    "--radius": `${t.radius}px`, "--radius-sm": `${t.radiusSm}px`,
    "--electric-green": isDark ? "#33ff66" : "#087e2a",
    "--green-surface": isDark ? "#020802" : "#effbf2", "--green-border": isDark ? "#33ff6670" : "#087e2a70",
    colorScheme: isDark ? "dark" : "light",
  } as CSSProperties}>
    <header className={`${rentals.header} ${styles.header}`}>
      <Link href="/promote/job-report" className={rentals.brand} aria-label="EOD-HUB Job Report home">
        <Image src="/branding/eod-crab-logo.png" width={40} height={40} alt="" />
        <span>EOD-HUB<span className={rentals.brandSection}>THE JOB REPORT</span></span>
      </Link>
      <nav aria-label="Job Report navigation">
        <Link href="/promote/rentals">Rentals</Link>
        <Link className={rentals.hubLink} href="/promote/job-report/manage">Manage subscription <ArrowRight size={15} /></Link>
        <Link className={rentals.hubLink} href="/login">Member sign in <ArrowRight size={15} /></Link>
      </nav>
    </header>
    {children}
    <footer className={styles.links}><span>EOD-HUB LLC</span><a href="mailto:hello@eod-hub.com">hello@eod-hub.com</a><Link href="/privacy">Privacy</Link><Link href="/promote/job-report/manage">Manage or cancel</Link></footer>
  </div>;
}
