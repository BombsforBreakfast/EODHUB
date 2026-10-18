import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import CopyPromotionEmail from "./CopyPromotionEmail";
import PromotionPackages from "./PromotionPackages";
import styles from "./promote.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Promote with EOD-HUB",
  description: "Connect your business, job opportunity, event, or housing listing with the EOD community. Choose a promotion package and send your request for review.",
  robots: { index: false, follow: false, noarchive: true },
  alternates: { canonical: "https://eod-hub.com/promote" },
};

const categories = ["Businesses & services", "Jobs & recruiting", "Housing & rentals", "Training & events"];

export default function PromotePage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="EOD-HUB home">
          <Image src="/branding/eod-crab-logo.png" alt="" width={86} height={54} className={styles.brandMark} priority />
          <span>EOD-HUB<small>ADVERTISING & PROMOTION</small></span>
        </Link>
        <CopyPromotionEmail className={styles.headerContact} label="Contact promotions" />
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="promote-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.statusDot} />FOR THE EOD COMMUNITY</p>
            <h1 id="promote-heading">Your message.<br /><span>Our community.</span></h1>
            <p className={styles.heroLead}>Promote your business to the EOD community.</p>
            <p className={styles.heroDescription}>Connect with Explosive Ordnance Disposal professionals, veterans, military personnel, and industry partners. Share an opportunity with a community that understands its value.</p>
            <ul className={styles.categoryList} aria-label="Promotion categories">
              {categories.map((category) => <li key={category}><Check size={14} aria-hidden="true" />{category}</li>)}
            </ul>
            <a className={styles.primaryButton} href="#packages-heading">Explore the packages<ArrowRight size={18} aria-hidden="true" /></a>
          </div>

          <aside className={styles.welcomeCard}>
            <ShieldCheck size={30} aria-hidden="true" />
            <p className={styles.eyebrow}>WELCOME TO EOD-HUB PROMOTIONS</p>
            <h2>A small team.<br />A focused audience.</h2>
            <p>Choose a package and tell us what you’d like to promote. We review each request and agree on the details before payment.</p>
            <p>No account required. Questions? <CopyPromotionEmail className={styles.footerContact} /></p>
            <span className={styles.cardSignature}>Personal service. Community first.</span>
          </aside>
        </section>

        <PromotionPackages />
      </main>

      <footer className={styles.footer}>
        <p>Independent promotion for the EOD community.</p>
        <nav aria-label="Promotion policies"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><CopyPromotionEmail className={styles.footerContact} label="Copy email" /></nav>
      </footer>
    </div>
  );
}
