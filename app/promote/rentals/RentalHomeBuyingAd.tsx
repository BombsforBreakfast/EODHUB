"use client";

import Image from "next/image";
import { track } from "@vercel/analytics";
import styles from "./RentalHomeBuyingAd.module.css";
import { useEffect, useRef } from "react";
import { recordRentalEngagement } from "@/app/lib/rentals/analytics.client";

const destination = "https://www.eodhb.com/?utm_source=eod-hub&utm_medium=referral&utm_campaign=rentals_home_buying";

export default function RentalHomeBuyingAd() {
  const logo = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!logo.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting && e.intersectionRatio >= .5)) {
        recordRentalEngagement("advertiser", "eod_home_buying", "impression"); observer.disconnect();
      }
    }, { threshold: .5 });
    observer.observe(logo.current); return () => observer.disconnect();
  }, []);
  function recordClick() {
    recordRentalEngagement("advertiser", "eod_home_buying", "ad_click");
    try {
      track("rentals_ad_click", { advertiser: "eod_home_buying", placement: "rentals_after_listings", destination: "www.eodhb.com" });
    } catch {
      // Analytics must never prevent someone from opening the advertiser's site.
    }
  }
  return <aside id="home-buying" className={styles.wrap} aria-labelledby="home-buying-title">
    <div className={styles.ad}>
      <h2 id="home-buying-title" className={styles.title}>Thinking about buying instead of renting?</h2>
      <a ref={logo} className={styles.logo} href={destination} target="_blank" rel="sponsored noopener noreferrer" onClick={recordClick} onAuxClick={event => { if (event.button === 1) recordClick(); }} aria-label="Contact EOD Home Buying (opens in a new tab)"><Image src="/branding/partners/eod-home-buying.png" alt="EOD Home Buying" width={397} height={156} unoptimized sizes="(max-width: 600px) 200px, 220px" /></a>
      <span className={styles.description}>Contact EOD Home Buying.</span>
    </div>
  </aside>;
}
