import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Check, Mail, ShieldCheck } from "lucide-react";
import { getPromoteAccessPassword, hasPromoteAccess, PROMOTE_ACCESS_COOKIE } from "@/app/lib/server/promoteAccess";
import AccessForm, { LockPromotionPage } from "./AccessForm";
import CopyPromotionEmail from "./CopyPromotionEmail";
import PromotionPackages from "./PromotionPackages";
import styles from "./promote.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {
  title: "Promote with EOD-HUB",
  description: "Connect your business, job opportunity, event, or housing listing with the EOD community. Contact EOD-HUB for advertiser access.",
  robots: { index: false, follow: false, noarchive: true },
  alternates: { canonical: "https://eod-hub.com/promote" },
};

const categories = ["Businesses & services", "Jobs & recruiting", "Housing & rentals", "Training & events"];

export default async function PromotePage() {
  const cookieStore = await cookies();
  const unlocked = hasPromoteAccess(cookieStore.get(PROMOTE_ACCESS_COOKIE)?.value, getPromoteAccessPassword());

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="EOD-HUB home">
          <Image src="/branding/eod-crab-logo.png" alt="" width={86} height={54} className={styles.brandMark} priority />
          <span>EOD-HUB<small>ADVERTISING & PROMOTION</small></span>
        </Link>
        {unlocked ? <LockPromotionPage /> : <CopyPromotionEmail className={styles.headerContact} label="Contact promotions" />}
      </header>

      <main className={styles.main}>
        <section className={`${styles.hero} ${unlocked ? styles.unlockedHero : ""}`} aria-labelledby="promote-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.statusDot} />FOR THE EOD COMMUNITY</p>
            <h1 id="promote-heading">Your message.<br /><span>Our community.</span></h1>
            <p className={styles.heroLead}>Promote your business to the EOD community.</p>
            <p className={styles.heroDescription}>Connect with Explosive Ordnance Disposal professionals, veterans, military personnel, and industry partners. Share an opportunity with a community that understands its value.</p>
            <ul className={styles.categoryList} aria-label="Promotion categories">
              {categories.map((category) => <li key={category}><Check size={14} aria-hidden="true" />{category}</li>)}
            </ul>
            {unlocked ? <a className={styles.primaryButton} href="#packages-heading">Explore the packages<ArrowRight size={18} aria-hidden="true" /></a> : null}
          </div>

          {unlocked ? (
            <aside className={styles.welcomeCard}>
              <ShieldCheck size={30} aria-hidden="true" />
              <p className={styles.eyebrow}>WELCOME TO EOD-HUB PROMOTIONS</p>
              <h2>A small team.<br />A focused audience.</h2>
              <p>Every promotion starts with a conversation. We review each request and agree on the details before payment.</p>
              <span className={styles.cardSignature}>Personal service. Community first.</span>
            </aside>
          ) : (
            <aside className={styles.accessCard} aria-labelledby="access-heading">
              <div className={styles.cardIcon}><Mail size={24} aria-hidden="true" /></div>
              <p className={styles.eyebrow}>ADVERTISER ACCESS</p>
              <h2 id="access-heading">Let’s start with<br />a conversation.</h2>
              <p>Email us what you’d like to promote. We’ll review your inquiry and send you a password to explore the packages.</p>
              <CopyPromotionEmail className={styles.emailAddress} showHint />
              <div className={styles.cardDivider} />
              <AccessForm />
            </aside>
          )}
        </section>

        {unlocked ? <PromotionPackages /> : (
          <div className={styles.trustBar}><ShieldCheck size={20} aria-hidden="true" /><p>Every advertisement is reviewed. Payment is requested only after approval.</p><span>No EOD-HUB membership required.</span></div>
        )}
      </main>

      <footer className={styles.footer}>
        <p>Independent promotion for the EOD community.</p>
        <nav aria-label="Promotion policies"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><CopyPromotionEmail className={styles.footerContact} label="Copy email" /></nav>
      </footer>
    </div>
  );
}
