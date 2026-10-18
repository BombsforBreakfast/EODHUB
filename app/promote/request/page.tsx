import { redirect } from "next/navigation";
import Link from "next/link";
import { PROMOTION_PACKAGES } from "@/app/lib/promotions";
import CopyPromotionEmail from "../CopyPromotionEmail";
import PromotionWizard from "./PromotionWizard";
import styles from "../promote.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your promotion request | EOD-HUB", robots: { index: false, follow: false } };
export default async function PromotionRequestPage({ searchParams }: { searchParams: Promise<{ package?: string }> }) {
  const selected = (await searchParams).package;
  const pkg = PROMOTION_PACKAGES.find(p => p === selected);
  if (!pkg) redirect("/promote");
  return <div className={styles.shell}>
    <header className={styles.header}><Link href="/promote" className={styles.brand}><span>EOD-HUB<small>PROMOTIONS</small></span></Link><CopyPromotionEmail className={styles.footerContact} /></header>
    <main className={`${styles.main} ${styles.wizardMain}`}><PromotionWizard selectedPackage={pkg} /></main>
    <footer className={styles.footer}><p>Your request is reviewed before any invoice or publication.</p><Link href="/privacy">Privacy policy</Link></footer>
  </div>;
}
